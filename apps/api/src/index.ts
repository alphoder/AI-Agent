import { createApp } from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { redis } from './config/redis';

async function main() {
  const app = createApp();

  await db.connect();
  logger.info('Database connected');

  await redis.ping();
  logger.info('Redis connected');

  app.listen(config.port, () => {
    logger.info(`API server running on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
