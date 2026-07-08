import { Router, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;
const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const bad = (res: Response, message: string, code = 400) => res.status(code).json({ success: false, error: { code: 'BAD_REQUEST', message } });

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);
router.use(rateLimit(60, 60));

// Short, unambiguous join code (no 0/O/1/I).
function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function roleIn(workspaceId: string, userId: string): Promise<string | null> {
  const r = await db.query('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
  return r.rows[0]?.role ?? null;
}

// GET / — workspaces I belong to.
router.get('/', wrap(async (req, res) => {
  const me = req.user!.sub;
  const r = await db.query(
    `SELECT w.id, w.name, w.join_code, wm.role,
            (SELECT COUNT(*)::int FROM workspace_members m WHERE m.workspace_id = w.id) AS member_count
       FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = $1
      ORDER BY w.created_at DESC`,
    [me],
  );
  ok(res, r.rows);
}));

// POST / — create a workspace (creator becomes leader).
router.post('/', wrap(async (req, res) => {
  const me = req.user!.sub;
  const name = String(req.body?.name || '').trim();
  if (name.length < 2) return bad(res, 'Workspace name is required.');

  let code = makeCode();
  for (let i = 0; i < 5; i++) {
    const clash = await db.query('SELECT 1 FROM workspaces WHERE join_code = $1', [code]);
    if (clash.rows.length === 0) break;
    code = makeCode();
  }
  const w = await db.query(
    'INSERT INTO workspaces (id, name, join_code, created_by) VALUES (generate_uuidv7(), $1, $2, $3) RETURNING id, name, join_code',
    [name.slice(0, 120), code, me],
  );
  const ws = w.rows[0];
  await db.query('INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (generate_uuidv7(), $1, $2, $3)', [ws.id, me, 'leader']);
  ok(res, { ...ws, role: 'leader', member_count: 1 });
}));

// POST /join — join by code.
router.post('/join', wrap(async (req, res) => {
  const me = req.user!.sub;
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return bad(res, 'Join code is required.');
  const w = await db.query('SELECT id, name, join_code FROM workspaces WHERE join_code = $1', [code]);
  if (w.rows.length === 0) return bad(res, 'No workspace found for that code.', 404);
  const ws = w.rows[0];
  await db.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (generate_uuidv7(), $1, $2, 'member')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [ws.id, me],
  );
  ok(res, { ...ws, role: (await roleIn(ws.id, me)) || 'member' });
}));

// GET /:id — workspace detail: members (leaderboard), assignments.
router.get('/:id', wrap(async (req, res) => {
  const me = req.user!.sub;
  const id = req.params.id;
  const myRole = await roleIn(id, me);
  if (!myRole) return bad(res, 'You are not a member of this workspace.', 403);

  const w = await db.query('SELECT id, name, join_code FROM workspaces WHERE id = $1', [id]);
  if (w.rows.length === 0) return bad(res, 'Workspace not found.', 404);

  // Members + leaderboard stats in one pass (ranked by average score).
  const members = await db.query(
    `SELECT u.id, u.name, u.email, wm.role,
            COUNT(sc.overall_score)::int AS scored_sessions,
            ROUND(AVG(sc.overall_score))::int AS avg_score,
            COALESCE(SUM(se.duration_sec) FILTER (WHERE se.status = 'completed'), 0)::int AS total_sec
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       LEFT JOIN sessions se ON se.user_id = u.id
       LEFT JOIN session_scores sc ON sc.session_id = se.id
      WHERE wm.workspace_id = $1
      GROUP BY u.id, u.name, u.email, wm.role
      ORDER BY avg_score DESC NULLS LAST, scored_sessions DESC, u.name ASC`,
    [id],
  );

  const assignments = await db.query(
    `SELECT wa.id, wa.note, wa.created_at, s.id AS scenario_id, s.title, s.language, s.difficulty_level, s.voice
       FROM workspace_assignments wa JOIN scenarios s ON s.id = wa.scenario_id
      WHERE wa.workspace_id = $1 ORDER BY wa.created_at DESC`,
    [id],
  );

  ok(res, {
    workspace: { ...w.rows[0], my_role: myRole },
    members: members.rows,
    assignments: assignments.rows,
  });
}));

// POST /:id/assignments — leader assigns a scenario as a test.
router.post('/:id/assignments', wrap(async (req, res) => {
  const me = req.user!.sub;
  const id = req.params.id;
  if ((await roleIn(id, me)) !== 'leader') return bad(res, 'Only the workspace leader can assign tests.', 403);
  const scenarioId = String(req.body?.scenario_id || '');
  if (!scenarioId) return bad(res, 'A scenario is required.');
  const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;
  const sc = await db.query('SELECT id FROM scenarios WHERE id = $1 AND deleted_at IS NULL', [scenarioId]);
  if (sc.rows.length === 0) return bad(res, 'Scenario not found.', 404);
  const a = await db.query(
    'INSERT INTO workspace_assignments (id, workspace_id, scenario_id, assigned_by, note) VALUES (generate_uuidv7(), $1, $2, $3, $4) RETURNING id',
    [id, scenarioId, me, note],
  );
  ok(res, { id: a.rows[0].id });
}));

// DELETE /:id/assignments/:aid — leader removes a test.
router.delete('/:id/assignments/:aid', wrap(async (req, res) => {
  const me = req.user!.sub;
  const id = req.params.id;
  if ((await roleIn(id, me)) !== 'leader') return bad(res, 'Only the workspace leader can remove tests.', 403);
  await db.query('DELETE FROM workspace_assignments WHERE id = $1 AND workspace_id = $2', [req.params.aid, id]);
  ok(res, { removed: true });
}));

export const workspaceRoutes: Router = router;
