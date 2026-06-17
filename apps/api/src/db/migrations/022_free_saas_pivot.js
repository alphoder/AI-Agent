/**
 * Migration 022: Free, voice-only, self-serve SaaS pivot.
 *
 * Collapses the enterprise multi-tenant LMS into a single-provider (Gemini),
 * Google-login, voice-only product:
 *   - Drops all Row-Level Security and the whole tenant / admin-learner model.
 *   - Folds Persona (system prompt, voice, language) INTO Scenario.
 *   - Removes avatars, personas, knowledge base, assignments, LTI, audit logs,
 *     tenants — none of which exist in the new product.
 *   - users: Google identity instead of SSO/tenant.
 *   - refresh_tokens: Postgres-backed (replaces Redis).
 *   - scenarios: ownership (created_by) + visibility (public/private) + the
 *     folded persona fields + a Gemini voice + language.
 *   - sessions: voice-only; body-language notes captured as text (no video).
 *   - session_scores: body-language dimension.
 *
 * This is a one-way structural pivot; `down` is best-effort and does NOT
 * restore the dropped tenant/avatar/persona model.
 */

exports.up = (pgm) => {
  // ---------------------------------------------------------------------------
  // 1. Drop Row-Level Security everywhere (policy name from migration 016).
  // ---------------------------------------------------------------------------
  const rlsTables = [
    'users', 'avatars', 'personas', 'knowledge_base_documents', 'scenarios',
    'scenario_assignments', 'sessions', 'session_transcripts', 'session_scores',
    'lti_platforms', 'lti_nonces', 'audit_logs',
  ];
  rlsTables.forEach((t) => {
    pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON ${t};`);
    pgm.sql(`ALTER TABLE IF EXISTS ${t} DISABLE ROW LEVEL SECURITY;`);
  });

  // ---------------------------------------------------------------------------
  // 2. SCENARIOS — fold persona in, add ownership/visibility/voice/language.
  //    Add columns first (nullable), backfill from the linked persona/avatar
  //    while those tables still exist, THEN drop the tenant/persona coupling.
  // ---------------------------------------------------------------------------
  pgm.sql(`
    ALTER TABLE scenarios
      ADD COLUMN IF NOT EXISTS system_prompt TEXT,
      ADD COLUMN IF NOT EXISTS language      VARCHAR(10)  NOT NULL DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS voice         VARCHAR(40)  NOT NULL DEFAULT 'Aoede',
      ADD COLUMN IF NOT EXISTS visibility    VARCHAR(10)  NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'private'));
  `);

  // Best-effort backfill from personas (system prompt) + voice_config (language).
  pgm.sql(`
    UPDATE scenarios s
    SET system_prompt = COALESCE(s.system_prompt, p.system_prompt),
        language = COALESCE(NULLIF(p.voice_config->>'language', ''), s.language)
    FROM personas p
    WHERE s.persona_id = p.id;
  `);

  // Existing scenarios become public library content; created_by may dangle
  // once users are reshaped, so relax it to nullable (seeded = NULL owner).
  pgm.sql(`
    ALTER TABLE scenarios ALTER COLUMN created_by DROP NOT NULL;
    ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS scenarios_persona_id_fkey;
    ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS scenarios_tenant_id_fkey;
    ALTER TABLE scenarios DROP COLUMN IF EXISTS persona_id;
    ALTER TABLE scenarios DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE scenarios DROP COLUMN IF EXISTS opening_context;
    CREATE INDEX IF NOT EXISTS idx_scenarios_visibility ON scenarios(visibility);
    CREATE INDEX IF NOT EXISTS idx_scenarios_created_by ON scenarios(created_by);
  `);

  // ---------------------------------------------------------------------------
  // 3. SESSIONS — voice only. Drop tenant/assignment/livekit/simli; add
  //    language + body_language_notes (text notes, never video).
  // ---------------------------------------------------------------------------
  pgm.sql(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS language VARCHAR(10),
      ADD COLUMN IF NOT EXISTS body_language_notes JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_assignment_id_fkey;
    ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_tenant_id_fkey;
    ALTER TABLE sessions DROP COLUMN IF EXISTS assignment_id;
    ALTER TABLE sessions DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE sessions DROP COLUMN IF EXISTS livekit_room_id;
    ALTER TABLE sessions DROP COLUMN IF EXISTS simli_session_id;
  `);

  // ---------------------------------------------------------------------------
  // 4. SESSION_SCORES — add body-language dimension.
  // ---------------------------------------------------------------------------
  pgm.sql(`
    ALTER TABLE session_scores
      ADD COLUMN IF NOT EXISTS body_language_score    NUMERIC(5,2)
        CHECK (body_language_score IS NULL OR (body_language_score >= 0 AND body_language_score <= 100)),
      ADD COLUMN IF NOT EXISTS body_language_feedback TEXT;
  `);

  // ---------------------------------------------------------------------------
  // 5. USERS — Google identity instead of SSO/tenant/role.
  // ---------------------------------------------------------------------------
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255),
      ADD COLUMN IF NOT EXISTS name       VARCHAR(255),
      ADD COLUMN IF NOT EXISTS picture    TEXT;

    UPDATE users SET name = COALESCE(name, display_name);

    DROP INDEX IF EXISTS users_tenant_id_email_index;
    DROP INDEX IF EXISTS users_tenant_id_external_id_index;
    DROP INDEX IF EXISTS users_tenant_id_index;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_fkey;
    ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE users DROP COLUMN IF EXISTS external_id;
    ALTER TABLE users DROP COLUMN IF EXISTS role;
    ALTER TABLE users DROP COLUMN IF EXISTS display_name;

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL;
  `);

  // ---------------------------------------------------------------------------
  // 6. REFRESH_TOKENS — Postgres-backed refresh/rotation (replaces Redis).
  // ---------------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          UUID PRIMARY KEY DEFAULT generate_uuidv7(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  VARCHAR(128) NOT NULL UNIQUE,
      family_id   UUID NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      revoked_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
  `);

  // ---------------------------------------------------------------------------
  // 7. Drop everything the new product no longer has. Order respects FKs;
  //    CASCADE clears any remaining references.
  // ---------------------------------------------------------------------------
  [
    'audit_logs',
    'lti_nonces',
    'lti_platforms',
    'scenario_avatars',
    'scenario_assignments',
    'knowledge_base_documents',
    'personas',
    'avatars',
    'tenants',
  ].forEach((t) => {
    pgm.sql(`DROP TABLE IF EXISTS ${t} CASCADE;`);
  });
};

exports.down = (pgm) => {
  // Best-effort teardown of what 022 added. Does NOT restore the dropped
  // tenant/avatar/persona model — this pivot is intended to be one-way.
  pgm.sql(`DROP TABLE IF EXISTS refresh_tokens CASCADE;`);
  pgm.sql(`
    ALTER TABLE session_scores
      DROP COLUMN IF EXISTS body_language_score,
      DROP COLUMN IF EXISTS body_language_feedback;
    ALTER TABLE sessions
      DROP COLUMN IF EXISTS language,
      DROP COLUMN IF EXISTS body_language_notes;
    ALTER TABLE scenarios
      DROP COLUMN IF EXISTS system_prompt,
      DROP COLUMN IF EXISTS language,
      DROP COLUMN IF EXISTS voice,
      DROP COLUMN IF EXISTS visibility;
    ALTER TABLE users
      DROP COLUMN IF EXISTS google_sub,
      DROP COLUMN IF EXISTS name,
      DROP COLUMN IF EXISTS picture;
  `);
};
