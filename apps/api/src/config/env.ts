import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { z } from 'zod';

// Load .env — try app-local first, then root monorepo .env
dotenvConfig({ path: resolve(__dirname, '../../.env') });
dotenvConfig({ path: resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5433/avatar_platform'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_PRIVATE_KEY: z.string().default('dev-private-key'),
  JWT_PUBLIC_KEY: z.string().default('dev-public-key'),
  OPENAI_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  SIMLI_API_KEY: z.string().optional(),
  HEYGEN_API_KEY: z.string().optional(),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('devsecret'),
  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  S3_BUCKET: z.string().default('avatar-platform'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX: z.string().default('avatar-platform'),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  INTERNAL_API_KEY: z.string().default('dev-internal-key'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

const envSchemaRefined = envSchema.refine(
  (data) => {
    if (data.NODE_ENV === 'production') {
      if (!data.JWT_PRIVATE_KEY.startsWith('-----BEGIN')) return false;
      if (data.DATABASE_URL.includes('localhost')) return false;
    }
    return true;
  },
  {
    message:
      'Production requires: JWT_PRIVATE_KEY must be a PEM key (starting with -----BEGIN) and DATABASE_URL must not contain localhost.',
  },
);

// Normalize a PEM-style env var: strip surrounding quotes (Render stores the
// value verbatim when pasted individually) and convert `\n` escape sequences
// back into real newlines. Safe to call on any string.
function normalizePem(raw: string | undefined): string | undefined {
  if (raw == null) return raw;
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (v.includes('\\n')) {
    v = v.replace(/\\n/g, '\n');
  }
  return v;
}

// Strip empty-string env vars so Zod defaults apply correctly
// (dotenv sets KEY= as "" which overrides Zod .default())
const cleanedEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => {
    const value = v === '' ? undefined : v;
    if (k === 'JWT_PRIVATE_KEY' || k === 'JWT_PUBLIC_KEY') {
      return [k, normalizePem(value)];
    }
    return [k, value];
  }),
);

const parsed = envSchemaRefined.safeParse(cleanedEnv);

if (!parsed.success) {
  const flat = parsed.error.flatten();
  console.error('Invalid environment variables:');
  console.error('  fieldErrors:', flat.fieldErrors);
  console.error('  formErrors:', flat.formErrors);
  // Log a redacted fingerprint of JWT_PRIVATE_KEY so we can tell if quotes/literal \n are the culprit
  const k = process.env.JWT_PRIVATE_KEY;
  if (k) {
    console.error(
      '  JWT_PRIVATE_KEY shape:',
      JSON.stringify({
        length: k.length,
        first10: k.slice(0, 10),
        last10: k.slice(-10),
        hasEscapedNewlines: k.includes('\\n'),
        hasRealNewlines: k.includes('\n'),
        startsWithBegin: k.startsWith('-----BEGIN'),
      }),
    );
  }
  process.exit(1);
}

export const config = {
  ...parsed.data,
  port: parsed.data.PORT,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(','),
};
