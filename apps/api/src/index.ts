import { createApp } from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import { db } from './config/database';
import { setupGracefulShutdown } from './utils/graceful-shutdown';

async function main() {
  const app = createApp();

  await db.connect();
  logger.info('Database connected');

  const server = app.listen(config.port, () => {
    logger.info(`API server running on port ${config.port}`);
  });

  // Bixy's 24-hour conversation memory: sweep expired rows on boot and then
  // every 15 minutes (unref'd so it never holds the process open at shutdown).
  const sweepAssistantMemory = async () => {
    try {
      await db.query('DELETE FROM assistant_memory WHERE expires_at <= NOW()');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'assistant memory sweep failed');
    }
  };
  sweepAssistantMemory();
  const memorySweep = setInterval(sweepAssistantMemory, 15 * 60 * 1000);
  memorySweep.unref();

  setupGracefulShutdown(server);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
