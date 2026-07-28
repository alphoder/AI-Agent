import { Router, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';

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

// ===== Enterprise cockpit ====================================================

import { JOURNEY, masteryFor } from '@avatar-platform/shared';
import { adjustWallet } from '../services/wallet-service';

const JOURNEY_TITLES = new Set(JOURNEY.flatMap((u) => u.lessons.map((l) => l.scenario)));
const JOURNEY_TOTAL = JOURNEY.reduce((s, u) => s + u.lessons.length, 0);
const isEthicsCriterion = (name: string) => /ethic|compliance/i.test(name);

/**
 * GET /:id/dashboard — the manager cockpit (leader only): per-member skill
 * heatmap, readiness index, activity, compliance summary + recent scored calls
 * (for the exportable report), and the minute pool. One query, aggregated here.
 */
router.get('/:id/dashboard', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const id = req.params.id;
  if ((await roleIn(id, me)) !== 'leader') return bad(res, 'Only the workspace leader can view the dashboard.', 403);

  const ws = await db.query('SELECT name, pool_seconds FROM workspaces WHERE id = $1', [id]);
  const rows = await db.query(
    `SELECT wm.user_id, u.name, u.email,
            s.id AS session_id, s.created_at AS session_at, sc2.title AS scenario_title,
            ss.overall_score, ss.criteria_scores, ss.narrative_feedback
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     LEFT JOIN sessions s ON s.user_id = wm.user_id AND s.created_at > NOW() - INTERVAL '90 days'
     LEFT JOIN session_scores ss ON ss.session_id = s.id
     LEFT JOIN scenarios sc2 ON sc2.id = s.scenario_id
     WHERE wm.workspace_id = $1
     ORDER BY s.created_at DESC NULLS LAST`,
    [id],
  );

  interface Agg {
    user_id: string; name: string | null; email: string;
    lastAt: string | null; sessions14d: number; scored: number;
    overallSum: number; bestByScenario: Map<string, number>;
    critSum: Map<string, { sum: number; n: number }>;
    ethicsSum: number; ethicsN: number; flags: number;
    recent: { at: string; title: string; overall: number; ethics: number | null; flagged: boolean }[];
  }
  const members = new Map<string, Agg>();
  const now = Date.now();

  for (const r of rows.rows) {
    let m = members.get(r.user_id);
    if (!m) {
      m = { user_id: r.user_id, name: r.name, email: r.email, lastAt: null, sessions14d: 0, scored: 0,
            overallSum: 0, bestByScenario: new Map(), critSum: new Map(), ethicsSum: 0, ethicsN: 0, flags: 0, recent: [] };
      members.set(r.user_id, m);
    }
    if (!r.session_id) continue;
    if (!m.lastAt) m.lastAt = r.session_at;
    if (now - new Date(r.session_at).getTime() < 14 * 86_400_000) m.sessions14d++;
    if (r.overall_score == null) continue;

    m.scored++;
    if (m.scored <= 10) m.overallSum += Number(r.overall_score);
    if (r.scenario_title && JOURNEY_TITLES.has(r.scenario_title)) {
      const best = m.bestByScenario.get(r.scenario_title) ?? 0;
      if (Number(r.overall_score) > best) m.bestByScenario.set(r.scenario_title, Number(r.overall_score));
    }

    let ethics: number | null = null;
    const crits = Array.isArray(r.criteria_scores) ? r.criteria_scores : [];
    for (const c of crits) {
      const name = String(c.criterion_name ?? '');
      const pct = (Number(c.score) / 5) * 100;
      const agg = m.critSum.get(name) ?? { sum: 0, n: 0 };
      agg.sum += pct; agg.n++;
      m.critSum.set(name, agg);
      if (isEthicsCriterion(name)) { m.ethicsSum += pct; m.ethicsN++; ethics = pct; }
    }
    const flagged = /WARNING|VIOLATION|⚠/.test(String(r.narrative_feedback ?? ''));
    if (flagged) m.flags++;
    if (m.recent.length < 8) {
      m.recent.push({ at: r.session_at, title: r.scenario_title, overall: Number(r.overall_score), ethics, flagged });
    }
  }

  const criteriaSet = new Set<string>();
  const out = [...members.values()].map((m) => {
    const avgOverall = m.scored ? m.overallSum / Math.min(m.scored, 10) : 0;
    const coverage = 100 * [...m.bestByScenario.values()].filter((b) => masteryFor(b) !== 'none').length / JOURNEY_TOTAL;
    const daysSince = m.lastAt ? (now - new Date(m.lastAt).getTime()) / 86_400_000 : Infinity;
    const recency = daysSince <= 7 ? 100 : daysSince <= 14 ? 50 : 0;
    const readiness = Math.round(0.5 * avgOverall + 0.3 * coverage + 0.2 * recency);
    const skills: Record<string, number> = {};
    m.critSum.forEach((v, k) => { skills[k] = Math.round(v.sum / v.n); criteriaSet.add(k); });
    return {
      user_id: m.user_id, name: m.name, email: m.email,
      last_practice: m.lastAt, sessions_14d: m.sessions14d, scored_calls: m.scored,
      avg_score: Math.round(avgOverall), coverage: Math.round(coverage), readiness,
      ethics_avg: m.ethicsN ? Math.round(m.ethicsSum / m.ethicsN) : null, compliance_flags: m.flags,
      inactive: daysSince > 14, skills, recent: m.recent,
    };
  }).sort((a, b) => b.readiness - a.readiness);

  ok(res, {
    workspace: { name: ws.rows[0]?.name, pool_seconds: ws.rows[0]?.pool_seconds ?? 0 },
    criteria: [...criteriaSet].sort(),
    members: out,
  });
}));

/**
 * POST /:id/pool — credit the workspace pool (platform admin only; the manual
 * stand-in for enterprise purchases until payments go live).
 */
router.post('/:id/pool', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const meta = await db.query('SELECT metadata FROM users WHERE id = $1', [me]);
  if ((meta.rows[0]?.metadata as { role?: string } | null)?.role !== 'admin') {
    return bad(res, 'Only platform admins can credit a pool.', 403);
  }
  const seconds = Math.floor(Number(req.body?.seconds));
  if (!Number.isFinite(seconds) || seconds <= 0) return bad(res, 'seconds must be a positive number.');
  const r = await db.query(
    'UPDATE workspaces SET pool_seconds = pool_seconds + $2, updated_at = NOW() WHERE id = $1 RETURNING pool_seconds',
    [req.params.id, seconds],
  );
  ok(res, { pool_seconds: r.rows[0]?.pool_seconds ?? 0 });
}));

/**
 * POST /:id/allocate — leader moves minutes from the pool to a member's wallet.
 */
router.post('/:id/allocate', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const id = req.params.id;
  if ((await roleIn(id, me)) !== 'leader') return bad(res, 'Only the workspace leader can allocate minutes.', 403);
  const { user_id, seconds } = req.body ?? {};
  const secs = Math.floor(Number(seconds));
  if (!user_id || !Number.isFinite(secs) || secs <= 0) return bad(res, 'user_id and positive seconds required.');
  if (!(await roleIn(id, user_id))) return bad(res, 'That user is not a member of this workspace.', 404);

  // Atomic pool decrement — fails cleanly if the pool is short.
  const dec = await db.query(
    'UPDATE workspaces SET pool_seconds = pool_seconds - $2, updated_at = NOW() WHERE id = $1 AND pool_seconds >= $2 RETURNING pool_seconds',
    [id, secs],
  );
  if (dec.rows.length === 0) return bad(res, 'Not enough minutes in the pool.', 402);
  await adjustWallet(user_id, secs, 'allocation', id);
  ok(res, { pool_seconds: dec.rows[0].pool_seconds });
}));

/**
 * PATCH /:id/branding — set the workspace's white-label academy branding (leader).
 */
router.patch('/:id/branding', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const id = req.params.id;
  if ((await roleIn(id, me)) !== 'leader') return bad(res, 'Only the workspace leader can set branding.', 403);
  const name = typeof req.body?.academy_name === 'string' ? req.body.academy_name.trim().slice(0, 80) || null : null;
  const color = typeof req.body?.accent_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.accent_color) ? req.body.accent_color : null;
  const logo = typeof req.body?.logo_url === 'string' ? req.body.logo_url.trim().slice(0, 500) || null : null;
  const r = await db.query(
    'UPDATE workspaces SET academy_name = $2, accent_color = $3, logo_url = $4, updated_at = NOW() WHERE id = $1 RETURNING academy_name, accent_color, logo_url',
    [id, name, color, logo],
  );
  ok(res, r.rows[0]);
}));

export const workspaceRoutes: Router = router;
