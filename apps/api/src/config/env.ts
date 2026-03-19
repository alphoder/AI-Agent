import { z } from 'zod';

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

const parsed = envSchemaRefined.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  port: parsed.data.PORT,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(','),
};
