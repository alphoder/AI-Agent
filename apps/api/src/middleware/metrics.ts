import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import client from 'prom-client';
import { config } from '../config/env';

// Register default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics();

// --- Custom metrics ---

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
});

export const activeSessionsGauge = new client.Gauge({
  name: 'active_sessions_total',
  help: 'Number of active training sessions',
  labelNames: ['tenant_id'] as const,
});

// --- Middleware ---

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSeconds = durationNs / 1e9;

    // Normalize route to avoid high-cardinality labels
    const route = req.route?.path ?? req.path;

    httpRequestDuration.observe(
      { method: req.method, route, status: res.statusCode.toString() },
      durationSeconds
    );

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: res.statusCode.toString(),
    });
  });

  next();
}

// --- /metrics endpoint handler ---

// Only trusted callers (Prometheus scrape) should see raw internal metrics.
// We accept either:
//   1. X-Metrics-Key header equal (constant-time) to INTERNAL_API_KEY, or
//   2. A loopback / private-range client IP when running behind an in-cluster
//      scrape.
// In production without either, we fail closed.
const PRIVATE_CIDR_PREFIXES = ['127.', '::1', '10.', '172.16.', '172.17.', '172.18.',
  '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
  '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.',
  'fc', 'fd'];

function isInternalIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = ip.replace(/^::ffff:/, '');
  return PRIVATE_CIDR_PREFIXES.some((p) => normalized.startsWith(p));
}

function metricsKeyMatches(provided: string): boolean {
  if (!config.INTERNAL_API_KEY || !provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(config.INTERNAL_API_KEY, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const provided = req.get('X-Metrics-Key') || req.get('X-Internal-Key') || '';
  const keyOk = metricsKeyMatches(provided);
  const ipOk = isInternalIp(req.ip) || isInternalIp(req.socket?.remoteAddress);

  // In production we require an explicit key OR an internal-network source.
  // In dev we leave the endpoint open for convenience.
  if (config.isProd && !keyOk && !ipOk) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Metrics endpoint not accessible' },
    });
    return;
  }

  try {
    res.set('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(String(err));
  }
}
