import { createApp } from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { redis } from './config/redis';
import { setupGracefulShutdown } from './utils/graceful-shutdown';

async function main() {
  const app = createApp();

  await db.connect();
  logger.info('Database connected');

  await redis.ping();
  logger.info('Redis connected');

  const server = app.listen(config.port, () => {
    logger.info(`API server running on port ${config.port}`);
  });

  setupGracefulShutdown(server);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
