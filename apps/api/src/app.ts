import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
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

export function createApp() {
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

  // Health check & metrics
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  // Error handling
  app.use(errorHandler);

  return app;
}
