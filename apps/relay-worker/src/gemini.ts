/**
 * One way to call generateContent. All eight ported endpoints use the same URL
 * shape and body, differing only in model, key, temperature and whether they
 * want JSON back — so the retry, the timeout and the response-shape handling
 * live here once rather than eight times.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiCall {
  model: string;
  apiKey: string;
  system: string;
  user: string;
  temperature: number;
  maxOutputTokens: number;
  json?: boolean;              // responseMimeType: application/json
  timeoutMs?: number;
}

/** The model's text, or null if it produced nothing usable. */
export async function callGemini(c: GeminiCall): Promise<string | null> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: c.system }] },
    contents: [{ role: 'user', parts: [{ text: c.user }] }],
    generationConfig: {
      temperature: c.temperature,
      maxOutputTokens: c.maxOutputTokens,
      ...(c.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const res = await fetch(`${BASE}/${c.model}:generateContent?key=${c.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(c.timeoutMs ?? 60_000),
  });

  if (!res.ok) {
    throw new GeminiError(res.status, (await res.text()).slice(0, 300));
  }

  const data = await res.json() as any;
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((p: any) => p?.text ?? '').join('').trim();
  return text || null;
}

export class GeminiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`gemini ${status}: ${detail}`);
  }
}

/**
 * Parse a JSON response that asked for `responseMimeType: application/json`.
 *
 * Gemini mostly honours it, but not always — it will occasionally wrap the
 * object in a ```json fence, or emit prose around it. The Python did the same
 * salvage, and dropping it would turn an occasional bad response into a 500.
 */
export function parseJsonish<T>(text: string | null): T | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
