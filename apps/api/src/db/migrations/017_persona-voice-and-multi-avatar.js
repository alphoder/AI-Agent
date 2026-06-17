/**
 * Migration 017: Persona voice config + scenario multi-avatar support
 *
 * Changes:
 * 1. Add voice_config JSONB to personas (voice, language, speakingRate, gender)
 * 2. Drop UNIQUE constraint on personas.avatar_id (allow many personas → one avatar)
 * 3. Create scenario_avatars junction table (scenario can offer multiple avatars)
 */

exports.up = (pgm) => {
  // 1. Add voice config to personas
  pgm.sql(`
    ALTER TABLE personas
    ADD COLUMN IF NOT EXISTS voice_config JSONB DEFAULT '{}';

    COMMENT ON COLUMN personas.voice_config IS 'Voice configuration: {voice, language, speakingRate, gender}';
  `);

  // 2. Drop unique constraint/index on personas.avatar_id to allow many-to-one
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'personas_avatar_id_unique') THEN
        DROP INDEX personas_avatar_id_unique;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'personas_avatar_id_unique' AND table_name = 'personas'
      ) THEN
        ALTER TABLE personas DROP CONSTRAINT personas_avatar_id_unique;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'personas_avatar_id_key' AND table_name = 'personas'
      ) THEN
        ALTER TABLE personas DROP CONSTRAINT personas_avatar_id_key;
      END IF;
    END $$;
  `);

  // 3. Create scenario_avatars junction table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS scenario_avatars (
      id UUID PRIMARY KEY DEFAULT generate_uuidv7(),
      scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      avatar_id UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(scenario_id, avatar_id)
    );

    CREATE INDEX IF NOT EXISTS idx_scenario_avatars_scenario ON scenario_avatars(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_avatars_avatar ON scenario_avatars(avatar_id);
  `);

  // 4. Populate voice_config from linked avatar's config for existing personas
  pgm.sql(`
    UPDATE personas p
    SET voice_config = COALESCE(
      (SELECT a.config FROM avatars a WHERE a.id = p.avatar_id),
      '{}'::jsonb
    )
    WHERE p.voice_config = '{}'::jsonb OR p.voice_config IS NULL;
  `);

  // 5. Populate scenario_avatars from existing persona→avatar links
  pgm.sql(`
    INSERT INTO scenario_avatars (scenario_id, avatar_id, is_default)
    SELECT DISTINCT s.id, p.avatar_id, true
    FROM scenarios s
    JOIN personas p ON s.persona_id = p.id
    WHERE p.avatar_id IS NOT NULL
      AND s.deleted_at IS NULL
      AND p.deleted_at IS NULL
    ON CONFLICT (scenario_id, avatar_id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS scenario_avatars;`);
  pgm.sql(`ALTER TABLE personas DROP COLUMN IF EXISTS voice_config;`);
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS personas_avatar_id_unique ON personas(avatar_id)
    WHERE deleted_at IS NULL;
  `);
};
