import { config } from '../config/env';
import { logger } from '../config/logger';

interface AIServiceRequestOptions {
  path: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * Build a WebSocket URL for the AI service from its configured base URL.
 * Converts http:// → ws:// and https:// → wss:// so the frontend can connect
 * securely on Vercel (mixed content blocking) while still working on localhost.
 *
 * Example: https://my-ai.onrender.com + /ws/test-chat → wss://my-ai.onrender.com/ws/test-chat
 */
export function aiServiceWsUrl(path: string): string {
  const base = (config.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
  let wsBase = base;
  if (base.startsWith('https://')) wsBase = 'wss://' + base.slice('https://'.length);
  else if (base.startsWith('http://')) wsBase = 'ws://' + base.slice('http://'.length);
  return wsBase + (path.startsWith('/') ? path : '/' + path);
}

export async function callAIService({ path, body, timeoutMs = 10000 }: AIServiceRequestOptions): Promise<Response> {
  const url = `${config.AI_SERVICE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': config.INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.error({ url, status: response.status }, 'AI service request failed');
      throw new Error(`AI service returned ${response.status}`);
    }

    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.error({ url, timeoutMs }, 'AI service request timed out');
      throw new Error(`AI service timeout after ${timeoutMs}ms`);
    }
    logger.error({ url, err: err.message }, 'AI service request error');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Background version with retry (up to 3 attempts with exponential backoff)
export function callAIServiceBackground(options: AIServiceRequestOptions): void {
  const maxRetries = 3;

  async function attempt(retryCount: number): Promise<void> {
    try {
      await callAIService(options);
    } catch (err: any) {
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
        logger.warn(
          { path: options.path, attempt: retryCount + 1, delay },
          'Background AI service call failed, retrying',
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        return attempt(retryCount + 1);
      }
      logger.error(
        { path: options.path, err: err.message, attempts: retryCount + 1 },
        'Background AI service call failed after all retries',
      );
    }
  }

  attempt(0);
}
