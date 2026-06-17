import { config } from '../config/env';

export default {
  databaseUrl: config.DATABASE_URL,
  dir: 'src/db/migrations',
  direction: 'up',
  migrationsTable: 'pgmigrations',
  log: console.log,
};
