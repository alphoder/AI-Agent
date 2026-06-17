import { Server } from 'http';
import { db } from '../config/database';
import { logger } from '../config/logger';

export function setupGracefulShutdown(server: Server): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

    server.close(() => {
      logger.info('HTTP server closed');
    });

    const deadline = setTimeout(() => {
      logger.warn('Graceful shutdown deadline reached, forcing exit');
      process.exit(1);
    }, 30_000);

    try {
      await db.pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
    }

    clearTimeout(deadline);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
