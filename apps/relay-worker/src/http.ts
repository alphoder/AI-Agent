/**
 * The Python service's HTTP endpoints, ported.
 *
 * All of them are the same shape: take JSON from the gateway, build a prompt,
 * ask Gemini, shape the answer. None of them touch the database or hold state,
 * which is why they port cleanly and why a plain switch beats a router here.
 *
 * Every one is internal-key protected, exactly as FastAPI's dependency did —
 * the gateway has already authenticated and ownership-checked the caller.
 */
import { GeminiError, callGemini, parseJsonish } from './gemini.ts';
import * as P from './prompts.ts';
import { buildUserPrompt, defaultRubric, grade, overall } from './scoring.ts';
import type { Env } from './shared.ts';

const FLASH_MODEL = 'gemini-3.5-flash-lite';        // scoring, notes, drills, speech
const PROMPT_MODEL = 'gemini-3.5-flash-lite';       // prompt redesign, on key 2

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const detail = (status: number, message: string) => json({ detail: message }, status);

/** Routes handled here. Returns null so index.ts can fall through to the sockets. */
export async function httpRoutes(request: Request, env: Env, path: string): Promise<Response | null> {
  if (!path.startsWith('/prompt/') && !path.startsWith('/drill') && !path.startsWith('/notes')
    && !path.startsWith('/scoring') && !path.startsWith('/speech')) return null;

  // Same gate FastAPI applied with require_internal_key.
  if (request.headers.get('X-Internal-Key') !== env.INTERNAL_API_KEY) {
    return detail(403, 'Forbidden');
  }
  if (request.method !== 'POST') return detail(405, 'Method not allowed');

  let body: any;
  try { body = await request.json(); } catch { return detail(400, 'invalid JSON body'); }

  switch (path) {
    case '/prompt/improve': return improvePrompt(body, env);
    case '/drill/turn': return drillTurn(body, env);
    case '/notes/summarise': return summariseNotes(body, env);
    case '/speech/rate': return rateSpeech(body, env);
    case '/scoring/evaluate': return evaluateSession(body, env);
    default: return detail(404, 'Not found');
  }
}

/**
 * POST /scoring/evaluate — grade a finished session and persist the result.
 *
 * Three steps, as the Python had them: fetch the transcript from the gateway,
 * ask Gemini, save the score. A failed save is logged but not fatal — the
 * caller still gets its result, because losing the grade the learner is waiting
 * on is worse than a missing row we can backfill.
 */
async function evaluateSession(body: any, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return detail(503, 'scoring is not configured');
  const sessionId = String(body?.session_id ?? '');
  if (!sessionId) return detail(400, 'session_id is required');

  let transcript: any[];
  try {
    const r = await fetch(`${env.API_GATEWAY_URL}/api/internal/sessions/${sessionId}/transcript`, {
      headers: { 'X-Internal-Key': env.INTERNAL_API_KEY },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const payload = await r.json() as any;
    transcript = payload?.data ?? payload;
  } catch (err) {
    console.error('scoring.transcript_fetch_failed', sessionId, redact(err));
    return detail(502, 'Failed to fetch transcript');
  }

  const rubric = Array.isArray(body?.rubric) && body.rubric.length
    ? body.rubric
    : defaultRubric(String(body?.difficulty_level ?? 'intermediate'));

  const user = buildUserPrompt({
    objective: String(body?.scenario_objective ?? ''),
    persona: String(body?.persona_context ?? ''),
    rubric,
    notes: Array.isArray(body?.body_language_notes) ? body.body_language_notes : [],
    transcript: Array.isArray(transcript) ? transcript : [],
  });

  // Two attempts, as the Python did: a truncated or fenced reply is common
  // enough that one retry is worth more than a clean failure.
  let parsed: any = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      parsed = parseJsonish<any>(await callGemini({
        model: FLASH_MODEL, apiKey: env.GEMINI_API_KEY, system: P.EVALUATION_SYSTEM,
        user, temperature: 0.3, maxOutputTokens: 8192, json: true, timeoutMs: 45_000,
      }));
    } catch (err) {
      lastError = err;
      console.warn('scoring.attempt_failed', attempt + 1, redact(err));
    }
  }
  if (!parsed) {
    console.error('scoring.engine_failed', sessionId, redact(lastError));
    return detail(502, 'Scoring failed after 2 attempts');
  }

  const criteria = grade(parsed.criteria_scores ?? [], rubric);
  const result = {
    overall_score: overall(criteria),
    criteria_scores: criteria,
    strengths: parsed.strengths ?? [],
    improvements: parsed.improvements ?? [],
    narrative_feedback: parsed.narrative_feedback ?? '',
    body_language_score: parsed.body_language_score ?? null,
    body_language_feedback: parsed.body_language_feedback ?? '',
    scored_by_model: FLASH_MODEL,
  };

  try {
    const save = await fetch(`${env.API_GATEWAY_URL}/api/internal/sessions/${sessionId}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': env.INTERNAL_API_KEY },
      body: JSON.stringify(result),
    });
    if (!save.ok) throw new Error(`HTTP ${save.status}`);
  } catch (err) {
    console.error('scoring.save_failed', sessionId, redact(err));
  }

  return json({ session_id: sessionId, ...result });
}

/**
 * POST /drill/turn — the customer persona in text, plus a one-line coach.
 * Flash Lite, so drills are effectively free and never metered.
 */
async function drillTurn(body: any, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return detail(503, 'drill is not configured');
  const persona = String(body?.persona ?? '');
  if (!persona.trim()) return detail(400, 'persona is required');

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const contents = messages.slice(-16).map((m: any) => ({   // last 8 exchanges is plenty
    role: m?.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(m?.text ?? '').slice(0, 1000) }],
  }));
  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    return detail(400, 'last message must be from the trainee');
  }

  const system = P.DRILL_SYSTEM
    .replace('{persona}', persona.slice(0, 4000))
    .replace('{technique}', String(body?.technique ?? '').slice(0, 300));

  try {
    const out = parseJsonish<any>(await callGemini({
      model: FLASH_MODEL, apiKey: env.GEMINI_API_KEY, system, contents,
      temperature: 0.8, maxOutputTokens: 300, json: true, timeoutMs: 20_000,
    }));
    if (!out) return detail(502, 'drill failed');
    return json({
      reply: String(out.reply ?? '').trim(),
      tip: String(out.tip ?? '').trim(),
      done: Boolean(out.done),
    });
  } catch (err) {
    console.error('drill.failed', redact(err));
    return detail(502, 'drill failed');
  }
}

/** POST /notes/summarise — the note the learner would have written, given time. */
async function summariseNotes(body: any, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return detail(503, 'AI notes are not configured');
  const material = String(body?.material ?? '');
  const myNotes = String(body?.my_notes ?? '');
  if (!material.trim() && !myNotes.trim()) return detail(400, 'nothing to summarise');

  const kind = String(body?.kind ?? 'page');
  const parts = [`WORKING ON: ${String(body?.subject ?? '').slice(0, 200)}`, `KIND: ${kind}`];
  if (myNotes.trim()) parts.push(`THEIR OWN NOTES AND FLAGGED MOMENTS:\n${myNotes.slice(0, 4000)}`);
  if (material.trim()) {
    parts.push(`${kind === 'session' ? 'CALL TRANSCRIPT' : 'SOURCE MATERIAL'}:\n${material.slice(0, 12000)}`);
  }

  try {
    let note = await callGemini({
      model: FLASH_MODEL, apiKey: env.GEMINI_API_KEY, system: P.NOTES_SYSTEM,
      user: parts.join('\n\n'), temperature: 0.5, maxOutputTokens: 600, timeoutMs: 20_000,
    });
    if (!note) return detail(502, 'AI notes failed');
    // The model is told not to use em-dashes; enforce it rather than trust it.
    note = note.replace(/—/g, ', ').replace(/–/g, '-');
    note = stripInventedStamps(note, myNotes);
    if (!note) return detail(502, 'AI notes failed');
    return json({ note: note.slice(0, 4000) });
  } catch (err) {
    console.error('notes.failed', redact(err));
    return detail(502, 'AI notes failed');
  }
}

const STAMP = /\[(\d{1,2}:\d{2})\]/g;

/**
 * Remove any [MM:SS] the learner did not actually flag.
 *
 * Observed in testing: given notes with no markers at all, the model still wrote
 * "[02:15] this is where you noticed...". A fabricated timestamp reads as a real
 * memory, so only stamps present in their own notes survive.
 *
 * Compared by value, not text: the gateway writes "1:30" and the model often
 * normalises it to "01:30". A string compare would strip a real marker.
 */
export function stripInventedStamps(note: string, myNotes: string): string {
  const secs = (stamp: string) => {
    const [m, s] = stamp.split(':');
    return Number(m) * 60 + Number(s);
  };
  const real = new Set([...(myNotes || '').matchAll(STAMP)].map((m) => secs(m[1])));
  if (!new RegExp(STAMP.source).test(note)) return note;
  const cleaned = note.replace(STAMP, (whole, inner) => (real.has(secs(inner)) ? whole : ''));
  // A removed stamp leaves a double space behind; collapse only those.
  return cleaned.replace(/[ \t]{2,}/g, ' ').trim();
}

/** POST /speech/rate — score a one-minute impromptu answer. */
async function rateSpeech(body: any, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return detail(503, 'speech rating is not configured');
  const topic = String(body?.topic ?? '');
  if (!topic.trim()) return detail(400, 'topic is required');

  const said = String(body?.transcript ?? '').trim();
  if (said.length < 20) {
    // Not worth a model call, and a real rating here would be noise.
    return json({
      overall: 0, structure: 0, ideas: 0, reasoning: 0, delivery: 0,
      verdict: 'There was not enough speech to rate.',
      strengths: [],
      improvements: ['Try to keep talking for the full minute, even if you repeat yourself.'],
      next_time: 'Open with your answer in one sentence, then give a reason for it.',
    });
  }

  const user =
    `TOPIC: ${topic.slice(0, 2000)}\n` +
    `SPOKE FOR: ${Number(body?.duration_sec ?? 60)}s · ${Number(body?.words ?? 0)} words · ` +
    `${Number(body?.fillers ?? 0)} filler words\n\nTRANSCRIPT:\n${said.slice(0, 6000)}`;

  try {
    const out = parseJsonish<any>(await callGemini({
      model: FLASH_MODEL, apiKey: env.GEMINI_API_KEY, system: P.SPEECH_SYSTEM,
      user, temperature: 0.6, maxOutputTokens: 700, json: true, timeoutMs: 25_000,
    }));
    if (!out) return detail(502, 'speech rating failed');
    return json({
      overall: clamp(out.overall), structure: clamp(out.structure), ideas: clamp(out.ideas),
      reasoning: clamp(out.reasoning), delivery: clamp(out.delivery),
      verdict: String(out.verdict ?? '').trim(),
      strengths: lines(out.strengths),
      improvements: lines(out.improvements),
      next_time: String(out.next_time ?? '').trim(),
    });
  } catch (err) {
    console.error('speech_rate.failed', redact(err));
    return detail(502, 'speech rating failed');
  }
}

export const clamp = (v: unknown, lo = 0, hi = 100): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.trunc(n))) : 0;
};

export const lines = (v: unknown, cap = 3): string[] =>
  (Array.isArray(v) ? v : []).slice(0, cap).map((x) => String(x).trim()).filter(Boolean);

/** Our request URL carries ?key=; never let it reach a log line. */
const redact = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/key=[A-Za-z0-9_-]+/g, 'key=REDACTED');

/**
 * POST /prompt/improve — turn a user's rough idea into an optimised agent prompt.
 * Runs on the SECOND Gemini key, as the Python did, so prompt redesign cannot
 * eat the practice-call quota.
 */
async function improvePrompt(body: any, env: Env): Promise<Response> {
  const raw = String(body?.prompt ?? '').trim();
  if (!raw) return detail(400, 'prompt is required');
  if (!env.GEMINI_PROMPT_API_KEY) return detail(503, 'prompt redesign is not configured');

  const context = body?.context ? String(body.context).slice(0, 1000) : '';
  const user = context
    ? `Context: ${context}\n\nUser idea:\n${raw.slice(0, 4000)}`
    : raw.slice(0, 4000);

  try {
    const improved = await callGemini({
      model: PROMPT_MODEL,
      apiKey: env.GEMINI_PROMPT_API_KEY,
      system: P.PROMPT_SYSTEM,
      user,
      temperature: 0.6,
      maxOutputTokens: 700,
      timeoutMs: 30_000,
    });
    if (!improved) return detail(502, 'Could not improve the prompt');
    return json({ improved });
  } catch (err) {
    console.error('prompt.improve_failed', err instanceof GeminiError ? err.message : String(err));
    return detail(502, 'Could not improve the prompt');
  }
}
