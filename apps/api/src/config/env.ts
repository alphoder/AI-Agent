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
  JWT_PRIVATE_KEY: z.string().default('dev-private-key'),
  JWT_PUBLIC_KEY: z.string().default('dev-public-key'),
  // Google OAuth — the client id the frontend signs in with; the API verifies
  // Google ID tokens against it. Client secret only needed for the code flow.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Clerk — optional second identity provider. Unset = POST /api/auth/clerk 404s.
  CLERK_SECRET_KEY: z.string().optional(),
  // Password for POST /api/auth/dev-login. Required (>=12 chars) for the route
  // to exist in production; below that it only works outside production.
  DEV_LOGIN_PASSWORD: z.string().optional(),
  DEV_LOGIN_EMAIL: z.string().optional(),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  // Cloudflare Worker that serves /ws/session. Unset = the Python relay keeps
  // it, which is also how you roll back.
  RELAY_WS_URL: z.string().optional(),
  INTERNAL_API_KEY: z.string().default('dev-internal-key'),
  // Secret used to sign short-lived WebSocket tickets. Must match the AI
  // service's WS_TICKET_SECRET. Falls back to INTERNAL_API_KEY if unset.
  WS_TICKET_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

// Dev default sentinels — these values MUST NOT survive into production. If any
// of these appear when NODE_ENV=production, we fail closed so the process cannot
// boot with trivially-guessable secrets.
const DEV_DEFAULT_SENTINELS: Record<string, string> = {
  JWT_PRIVATE_KEY: 'dev-private-key',
  JWT_PUBLIC_KEY: 'dev-public-key',
  INTERNAL_API_KEY: 'dev-internal-key',
};

const envSchemaRefined = envSchema.refine(
  (data) => {
    if (data.NODE_ENV === 'production') {
      if (!data.JWT_PRIVATE_KEY.startsWith('-----BEGIN')) return false;
      if (data.DATABASE_URL.includes('localhost')) return false;
      for (const [key, sentinel] of Object.entries(DEV_DEFAULT_SENTINELS)) {
        if ((data as Record<string, unknown>)[key] === sentinel) return false;
      }
      if (!data.INTERNAL_API_KEY || data.INTERNAL_API_KEY.length < 32) return false;
      if (!data.GOOGLE_CLIENT_ID) return false;
    }
    return true;
  },
  {
    message:
      'Production requires: JWT_PRIVATE_KEY must be a PEM key (starting with -----BEGIN), DATABASE_URL must not contain localhost, INTERNAL_API_KEY must be >=32 chars, GOOGLE_CLIENT_ID must be set, and no dev-default secrets may be used.',
  },
);

// Normalize a PEM-style env var: strip surrounding quotes and convert `\n`
// escape sequences back into real newlines. Safe to call on any string.
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

// Strip empty-string env vars so Zod defaults apply correctly.
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
  process.exit(1);
}

export const config = {
  ...parsed.data,
  port: parsed.data.PORT,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(','),
};
