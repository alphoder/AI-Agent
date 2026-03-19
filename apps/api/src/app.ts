import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { db } from './config/database';
import { redis } from './config/redis';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { authRoutes } from './routes/auth.routes';
import { avatarRoutes } from './routes/avatar.routes';
import { personaRoutes } from './routes/persona.routes';
import { scenarioRoutes } from './routes/scenario.routes';
import { sessionRoutes } from './routes/session.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { ltiRoutes } from './routes/lti.routes';

export function createApp(): express.Express {
  const app = express();

  // Security & parsing
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://*.simli.ai', 'https://*.heygen.ai'],
          connectSrc: [
            "'self'",
            'wss://*.livekit.cloud',
            'wss://*.deepgram.com',
            'https://*.simli.ai',
            'https://*.heygen.ai',
            'https://*.openai.com',
          ],
          mediaSrc: ["'self'", 'blob:'],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
    })
  );
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(metricsMiddleware);

  // Health checks & metrics
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health', async (_req, res) => {
    const checks: Record<string, string> = {};
    let healthy = true;

    // Check database
    try {
      await db.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      healthy = false;
    }

    // Check Redis
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      healthy = false;
    }

    const status = healthy ? 'ok' : 'degraded';
    res.status(healthy ? 200 : 503).json({
      status,
      service: 'api',
      dependencies: checks,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/metrics', metricsHandler);

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/avatars', avatarRoutes);
  app.use('/api/personas', personaRoutes);
  app.use('/api/scenarios', scenarioRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/lti', ltiRoutes);

  // 404 catch-all
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // Error handling
  app.use(errorHandler);

  return app;
}
