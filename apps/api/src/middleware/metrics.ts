import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

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

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(String(err));
  }
}
