/**
 * Migration 019: Scheduled-start + admin notes on scenario assignments.
 *
 *   scheduled_at — optional start time the admin schedules for the learner.
 *                 Distinct from due_date: `due_date` is a deadline, this is
 *                 a planned start ("do it on Tue at 2 PM"). A nudge, not a
 *                 lock — learners can still start before or after.
 *   notes       — free-text instructions from the admin (markdown allowed).
 *                 Surfaced on the learner dashboard before they begin.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE scenario_assignments
      ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
    ALTER TABLE scenario_assignments
      ADD COLUMN IF NOT EXISTS notes TEXT;

    CREATE INDEX IF NOT EXISTS idx_scenario_assignments_scheduled_at
      ON scenario_assignments(scheduled_at)
      WHERE scheduled_at IS NOT NULL;

    COMMENT ON COLUMN scenario_assignments.scheduled_at IS
      'Optional planned start time for the learner. Calendar shows it; not enforced.';
    COMMENT ON COLUMN scenario_assignments.notes IS
      'Admin-authored instructions for the learner (markdown). Rendered above the training scene.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_scenario_assignments_scheduled_at;
    ALTER TABLE scenario_assignments DROP COLUMN IF EXISTS scheduled_at;
    ALTER TABLE scenario_assignments DROP COLUMN IF EXISTS notes;
  `);
};
