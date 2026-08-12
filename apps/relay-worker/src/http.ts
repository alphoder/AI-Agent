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
import { GeminiError, callGemini } from './gemini';
import * as P from './prompts';
import { Env } from './shared';

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
    default: return detail(404, 'Not found');
  }
}

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
