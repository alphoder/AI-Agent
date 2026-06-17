/**
 * Migration 020: HeyGen-only deployment.
 *
 * Relaxes the tts_provider CHECK constraint to include 'heygen' and
 * normalises every existing avatar to provider='heygen' with a sensible
 * HeyGen library face id by gender. Old Simli face UUIDs are discarded
 * (they wouldn't have worked against the HeyGen API anyway).
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- Relax tts_provider CHECK constraint to include 'heygen'
    ALTER TABLE avatars DROP CONSTRAINT IF EXISTS avatars_tts_provider_check;
    ALTER TABLE avatars
      ADD CONSTRAINT avatars_tts_provider_check
      CHECK (tts_provider IS NULL OR tts_provider IN ('deepgram','openai','elevenlabs','heygen'));

    -- Make tts_voice_id nullable (HeyGen falls back to avatar default voice
    -- when no voice_id is supplied)
    ALTER TABLE avatars ALTER COLUMN tts_voice_id DROP NOT NULL;

    -- Normalise every non-deleted avatar to HeyGen provider. Pick a safe
    -- library face per gender; clear tts_voice_id so HeyGen uses the
    -- avatar's default voice (we no longer store Deepgram/Simli voice ids).
    UPDATE avatars
    SET provider = 'heygen',
        tts_provider = 'heygen',
        provider_avatar_id = CASE
          WHEN gender = 'male' THEN 'Wayne_20240711'
          WHEN gender = 'female' THEN 'Monica_inblackskirt_20220820'
          ELSE 'Wayne_20240711'
        END,
        tts_voice_id = NULL
    WHERE deleted_at IS NULL
      AND (provider != 'heygen'
           OR provider_avatar_id IS NULL
           OR provider_avatar_id = ''
           OR provider_avatar_id ~ '^[a-f0-9-]{20,}$'   -- clearly a UUID
           OR provider_avatar_id = 'simli-preset'
           OR tts_provider != 'heygen');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE avatars DROP CONSTRAINT IF EXISTS avatars_tts_provider_check;
    ALTER TABLE avatars
      ADD CONSTRAINT avatars_tts_provider_check
      CHECK (tts_provider IS NULL OR tts_provider IN ('deepgram','openai','elevenlabs'));
  `);
};
