import { Router, Response, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { callAIService } from '../utils/ai-service-client';
import { adjustWallet, ensureWallet, walletEnforced } from '../services/wallet-service';

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

const MAX_BODY = 4000;
const MAX_LABEL = 120;
const PAGE_SIZE = 50;
const CONTEXT_TYPES = new Set(['module', 'session', 'page']);

/** Cost of one AI note, in wallet seconds. 1 token = 1 second. */
export const AI_NOTE_COST = 2;
const AI_NOTES_PER_DAY = 10;

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Strip control characters and cap. Note bodies are rendered back to the user. */
function clean(value: unknown, max: number): string {
  // Keep newlines (notes are multi-line), drop every other control char.
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .slice(0, max)
    .trim();
}

function contextOf(body: Record<string, unknown>) {
  const type = CONTEXT_TYPES.has(String(body.context_type)) ? String(body.context_type) : 'page';
  const rawId = String(body.context_id ?? '');
  return {
    type,
    id: UUID_RE.test(rawId) ? rawId : null,
    label: clean(body.context_label, MAX_LABEL) || null,
  };
}

/**
 * GET /api/notes?context_type&context_id&q&page
 * Own notes only, newest first.
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const where: string[] = ['user_id = $1'];
  const params: unknown[] = [me];

  const ct = String(req.query.context_type ?? '');
  if (CONTEXT_TYPES.has(ct)) {
    params.push(ct);
    where.push(`context_type = $${params.length}`);
    const cid = String(req.query.context_id ?? '');
    if (UUID_RE.test(cid)) {
      params.push(cid);
      where.push(`context_id = $${params.length}`);
    } else if (ct === 'page') {
      // Page notes share one context_type and have no id, so the label is what
      // separates them. Without this, "My Journey" showed every page note.
      const label = clean(req.query.context_label, MAX_LABEL);
      if (label) {
        params.push(label);
        where.push(`context_label = $${params.length}`);
      }
    }
  }
  const q = clean(req.query.q, 100);
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`LOWER(body) LIKE $${params.length}`);
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const result = await db.query(
    `SELECT id, body, context_type, context_id, context_label, at_sec, source, created_at, updated_at
       FROM notes WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ success: true, data: result.rows });
}));

/**
 * POST /api/notes — a written note, or a mid-call marker (empty body + at_sec).
 */
router.post('/', rateLimit(120), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const b = req.body ?? {};
  const body = clean(b.body, MAX_BODY);
  const atSecRaw = Number(b.at_sec);
  const atSec = Number.isFinite(atSecRaw) && atSecRaw >= 0 ? Math.min(Math.floor(atSecRaw), 86400) : null;

  // A note is either words or a moment; an empty one is nothing.
  if (!body && atSec === null) {
    return res.status(400).json({ success: false, error: { code: 'EMPTY_NOTE', message: 'Write something, or drop a marker.' } });
  }

  const ctx = contextOf(b);
  const result = await db.query(
    `INSERT INTO notes (user_id, body, context_type, context_id, context_label, at_sec)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, body, context_type, context_id, context_label, at_sec, source, created_at, updated_at`,
    [me, body, ctx.type, ctx.id, ctx.label, atSec],
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

/** PATCH /api/notes/:id — edit my own note. */
router.patch('/:id', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid note id' } });
  }
  const body = clean(req.body?.body, MAX_BODY);
  const result = await db.query(
    `UPDATE notes SET body = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, body, context_type, context_id, context_label, at_sec, source, created_at, updated_at`,
    [req.params.id, me, body],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Note not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

/** DELETE /api/notes/:id */
router.delete('/:id', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid note id' } });
  }
  const result = await db.query('DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, me]);
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Note not found' } });
  }
  res.json({ success: true, data: { id: result.rows[0].id } });
}));

/**
 * POST /api/notes/ai — summarise this context into a note. Costs AI_NOTE_COST tokens.
 *
 * The source material is assembled from OWNER-CHECKED queries only: a session's
 * transcript is loaded by (session_id AND user_id), never by a raw id from the body.
 */
router.post('/ai', rateLimit(20), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const ctx = contextOf(req.body ?? {});

  const usedToday = await db.query(
    "SELECT COUNT(*)::int AS n FROM notes WHERE user_id = $1 AND source = 'ai' AND created_at > NOW() - INTERVAL '24 hours'",
    [me],
  );
  if (Number(usedToday.rows[0]?.n ?? 0) >= AI_NOTES_PER_DAY) {
    return res.status(429).json({ success: false, error: { code: 'AI_NOTE_LIMIT', message: `You can make ${AI_NOTES_PER_DAY} AI notes a day. Try again tomorrow.` } });
  }

  const balance = await ensureWallet(me);
  if (walletEnforced() && balance < AI_NOTE_COST) {
    return res.status(402).json({ success: false, error: { code: 'INSUFFICIENT_TOKENS', message: `An AI note costs ${AI_NOTE_COST} tokens. Top up to continue.` } });
  }

  // --- gather source material, always scoped to me ---
  let subject = '';
  let material = '';
  const myNotes = await db.query(
    `SELECT body, at_sec FROM notes
      WHERE user_id = $1 AND source = 'user'
        AND context_type = $2 AND ($3::uuid IS NULL OR context_id = $3)
      ORDER BY COALESCE(at_sec, 0) ASC, created_at ASC LIMIT 60`,
    [me, ctx.type, ctx.id],
  );
  const mine = myNotes.rows
    .map((n: { body: string; at_sec: number | null }) =>
      n.at_sec != null ? `[${fmt(n.at_sec)}] ${n.body || '(marked this moment)'}` : n.body)
    .filter(Boolean)
    .join('\n');

  if (ctx.type === 'session' && ctx.id) {
    const session = await db.query(
      `SELECT s.id, sc.title FROM sessions s
         LEFT JOIN scenarios sc ON sc.id = s.scenario_id
        WHERE s.id = $1 AND s.user_id = $2`,
      [ctx.id, me],
    );
    if (session.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    subject = session.rows[0].title ?? 'your call';
    const turns = await db.query(
      `SELECT role, content, turn_number FROM session_transcripts
        WHERE session_id = $1 ORDER BY turn_number ASC LIMIT 200`,
      [ctx.id],
    );
    material = turns.rows
      .map((t: { role: string; content: string }) => `${t.role === 'learner' ? 'Me' : t.role === 'avatar' ? 'Customer' : 'System'}: ${t.content}`)
      .join('\n')
      .slice(0, 12000);
  } else if (ctx.type === 'module' && ctx.id) {
    const sc = await db.query(
      `SELECT title, description, objective FROM scenarios
        WHERE id = $1 AND deleted_at IS NULL AND (visibility = 'public' OR created_by = $2)`,
      [ctx.id, me],
    );
    if (sc.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
    }
    subject = sc.rows[0].title;
    material = [sc.rows[0].description, sc.rows[0].objective].filter(Boolean).join('\n').slice(0, 4000);
  } else {
    subject = ctx.label ?? 'your practice';
  }

  if (!mine && !material) {
    return res.status(400).json({ success: false, error: { code: 'NOTHING_TO_SUMMARISE', message: 'Write a note or drop a marker first, then ask for AI notes.' } });
  }

  let note = '';
  try {
    const aiRes = await callAIService({
      path: '/notes/summarise',
      timeoutMs: 25000,
      body: { subject, kind: ctx.type, material, my_notes: mine },
    });
    const payload = (await aiRes.json()) as { note?: unknown };
    note = clean(payload.note, MAX_BODY);
  } catch (err) {
    logger.error({ err, userId: me }, 'AI note failed');
    return res.status(502).json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'Could not write your notes right now. You were not charged.' } });
  }
  if (!note) {
    return res.status(502).json({ success: false, error: { code: 'AI_EMPTY', message: 'Could not write your notes right now. You were not charged.' } });
  }

  const saved = await db.query(
    `INSERT INTO notes (user_id, body, context_type, context_id, context_label, source)
     VALUES ($1,$2,$3,$4,$5,'ai')
     RETURNING id, body, context_type, context_id, context_label, at_sec, source, created_at, updated_at`,
    [me, note, ctx.type, ctx.id, ctx.label],
  );

  // Charge only once the note exists. Ledgered even in beta, so burn data accrues.
  let newBalance = balance;
  try {
    newBalance = await adjustWallet(me, -AI_NOTE_COST, 'ai_note', saved.rows[0].id);
  } catch (err) {
    logger.error({ err, userId: me }, 'AI note debit failed');
  }

  res.status(201).json({ success: true, data: { note: saved.rows[0], cost: AI_NOTE_COST, balance: newBalance } });
}));

function fmt(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Exposed for the self-check in notes.test.ts. */
export const __test = { clean, contextOf };

export const notesRoutes: Router = router;
