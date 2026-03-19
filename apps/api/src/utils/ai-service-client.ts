import { config } from '../config/env';
import { logger } from '../config/logger';

interface AIServiceRequestOptions {
  path: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}

export async function callAIService({ path, body, timeoutMs = 10000 }: AIServiceRequestOptions): Promise<Response> {
  const url = `${config.AI_SERVICE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// Fire-and-forget version that logs errors but doesn't throw
export function callAIServiceBackground(options: AIServiceRequestOptions): void {
  callAIService(options).catch(err => {
    logger.error({ path: options.path, err: err.message }, 'Background AI service call failed');
  });
}
