/**
 * Migration 021: per-assignment language override.
 *
 * Every avatar carries a default language in avatars.config.language, but
 * an admin should be able to override it when assigning a specific scenario
 * to a specific learner (e.g. "train Jane in Spanish using Dr. Chen").
 * This column holds that override; NULL means "use the avatar's default".
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE scenario_assignments
      ADD COLUMN IF NOT EXISTS language VARCHAR(10);

    COMMENT ON COLUMN scenario_assignments.language IS
      'ISO 639-1 language code (en, es, fr, hi, ...) the learner will train in. NULL = use the avatar default.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE scenario_assignments DROP COLUMN IF EXISTS language;`);
};
