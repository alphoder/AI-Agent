/** Migration 031: the journey is built a week at a time.
 *
 *  A plan is now one 7-day week, and finishing week N unlocks week N+1 — which
 *  is generated from what they actually scored, skipping what they have already
 *  mastered. So a user has SEVERAL live plan rows, one per week, and "newest
 *  row wins" is no longer the right read.
 *
 *  Existing rows become week 1. The unique constraint makes "rebuild my plan"
 *  an upsert of that week rather than an insert that shadows it, so a user can
 *  no longer accumulate dead plans they cannot see.
 */
exports.up = (pgm) => {
  pgm.addColumn('journey_plans', {
    week: { type: 'integer', notNull: true, default: 1 },
  });

  // Collapse any pre-existing history: keep each user's newest plan as week 1.
  pgm.sql(`
    DELETE FROM journey_plans p
     WHERE EXISTS (
       SELECT 1 FROM journey_plans q
        WHERE q.user_id = p.user_id AND q.created_at > p.created_at
     )
  `);

  pgm.addConstraint('journey_plans', 'journey_plans_user_week_unique', {
    unique: ['user_id', 'week'],
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('journey_plans', 'journey_plans_user_week_unique');
  pgm.dropColumn('journey_plans', 'week');
};
