/**
 * Migration 018: Clarify avatar/persona split + per-assignment context.
 *
 * Data model after this migration:
 *   Avatar  = face + voice identity (name, gender, provider face id, TTS voice id)
 *   Persona = character + voice modulation (system prompt, pitch/speed/stability)
 *   Scenario = conversational scene + scoring rubric
 *   scenario_assignments = links scenario+persona+avatar+learner for a training run
 *
 * Changes:
 *   1. avatars: add gender, tts_provider, tts_voice_id
 *   2. personas: voice_config remains JSONB but documented shape is now
 *      { pitch: -12..12, speed: 0.5..2, stability: 0..1, similarity_boost: 0..1 }
 *      (no voice id — voice is the avatar's property now)
 *   3. scenario_assignments: add persona_id + avatar_id so one scenario can be
 *      assigned with different persona/avatar combinations per learner
 */

exports.up = (pgm) => {
  // 1. Avatars: gender + base voice
  pgm.sql(`
    ALTER TABLE avatars
      ADD COLUMN IF NOT EXISTS gender VARCHAR(20)
        CHECK (gender IS NULL OR gender IN ('female','male','non_binary','other'));
    ALTER TABLE avatars
      ADD COLUMN IF NOT EXISTS tts_provider VARCHAR(20)
        CHECK (tts_provider IS NULL OR tts_provider IN ('deepgram','openai','elevenlabs'));
    ALTER TABLE avatars
      ADD COLUMN IF NOT EXISTS tts_voice_id VARCHAR(100);

    COMMENT ON COLUMN avatars.gender IS 'Visual/voice gender for auto-matching in persona/assignment UI';
    COMMENT ON COLUMN avatars.tts_provider IS 'TTS service to use for this avatars voice';
    COMMENT ON COLUMN avatars.tts_voice_id IS 'Voice ID at the TTS provider (e.g. aura-asteria-en for Deepgram)';
  `);

  // 2. Backfill gender/voice on existing avatars from their config JSON (if present)
  //    so existing avatars dont appear broken in the new UI.
  pgm.sql(`
    UPDATE avatars
    SET gender = COALESCE(gender,
                          NULLIF(config->>'gender', ''),
                          CASE
                            WHEN LOWER(config->>'voice') IN ('nova','shimmer','alloy','ember') THEN 'female'
                            WHEN LOWER(config->>'voice') IN ('echo','onyx','fable','ash','sage') THEN 'male'
                            ELSE NULL
                          END),
        tts_provider = COALESCE(tts_provider, NULLIF(config->>'tts_provider', ''), 'deepgram'),
        tts_voice_id = COALESCE(tts_voice_id,
                                NULLIF(config->>'tts_voice_id', ''),
                                NULLIF(config->>'voice', ''),
                                'aura-asteria-en')
    WHERE deleted_at IS NULL;
  `);

  // 3. scenario_assignments: per-assignment persona + avatar
  pgm.sql(`
    ALTER TABLE scenario_assignments
      ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id) ON DELETE SET NULL;
    ALTER TABLE scenario_assignments
      ADD COLUMN IF NOT EXISTS avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_scenario_assignments_persona ON scenario_assignments(persona_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_assignments_avatar ON scenario_assignments(avatar_id);

    COMMENT ON COLUMN scenario_assignments.persona_id IS 'Persona selected for this specific assignment (overrides scenario default)';
    COMMENT ON COLUMN scenario_assignments.avatar_id IS 'Avatar selected for this specific assignment (overrides scenario default)';
  `);

  // 4. Backfill existing assignments with the scenarios persona and that personas avatar
  pgm.sql(`
    UPDATE scenario_assignments sa
    SET persona_id = s.persona_id,
        avatar_id  = p.avatar_id
    FROM scenarios s
    LEFT JOIN personas p ON p.id = s.persona_id AND p.deleted_at IS NULL
    WHERE sa.scenario_id = s.id
      AND sa.persona_id IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_scenario_assignments_persona;
    DROP INDEX IF EXISTS idx_scenario_assignments_avatar;
    ALTER TABLE scenario_assignments DROP COLUMN IF EXISTS persona_id;
    ALTER TABLE scenario_assignments DROP COLUMN IF EXISTS avatar_id;
    ALTER TABLE avatars DROP COLUMN IF EXISTS gender;
    ALTER TABLE avatars DROP COLUMN IF EXISTS tts_provider;
    ALTER TABLE avatars DROP COLUMN IF EXISTS tts_voice_id;
  `);
};
