import { Server } from 'http';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

export function setupGracefulShutdown(server: Server): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Wait for in-flight requests (max 30s)
    const deadline = setTimeout(() => {
      logger.warn('Graceful shutdown deadline reached, forcing exit');
      process.exit(1);
    }, 30_000);

    try {
      // Close database pool
      await db.pool.end();
      logger.info('Database pool closed');

      // Close Redis
      await redis.quit();
      logger.info('Redis connection closed');
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
    }

    clearTimeout(deadline);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
