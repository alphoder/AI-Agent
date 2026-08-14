import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { db } from './config/database';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { authRoutes } from './routes/auth.routes';
import { scenarioRoutes } from './routes/scenario.routes';
import { sessionRoutes } from './routes/session.routes';
import { assistantRoutes } from './routes/assistant.routes';
import { workspaceRoutes } from './routes/workspace.routes';
import { journeyRoutes } from './routes/journey.routes';
import { profileRoutes } from './routes/profile.routes';
import { speakRoutes } from './routes/speak.routes';
import { competitionRoutes } from './routes/competition.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { notesRoutes } from './routes/notes.routes';
import { walletRoutes } from './routes/wallet.routes';
import { internalRoutes } from './routes/internal.routes';

export function createApp(): express.Express {
  const app = express();

  // Trust reverse proxy (correct req.ip / req.protocol behind LB/Ingress)
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://accounts.google.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
          connectSrc: ["'self'", 'https://accounts.google.com'],
          frameSrc: ['https://accounts.google.com'],
          mediaSrc: ["'self'", 'blob:'],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(metricsMiddleware);

  // Health checks & metrics
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Public pre-warm: hitting this wakes the API (free-tier cold start), and we
  // fire-and-forget a ping to wake the AI service too. The landing page calls
  // it on load so both services are warm by the time the visitor clicks Start.
  app.get('/warmup', (_req, res) => {
    fetch(`${config.AI_SERVICE_URL.replace(/\/$/, '')}/health/ready`).catch(() => {});
    res.json({ status: 'warming' });
  });

  const healthHandler = async (_req: express.Request, res: express.Response) => {
    const checks: Record<string, string> = {};
    let healthy = true;
    try {
      await db.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      healthy = false;
    }
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'api',
      dependencies: checks,
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  app.get('/metrics', metricsHandler);

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/scenarios', scenarioRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api/journey', journeyRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/notes', notesRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/competition', competitionRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/speak', speakRoutes);
  app.use('/api/internal', internalRoutes);

  // 404 catch-all
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  app.use(errorHandler);
  return app;
}
