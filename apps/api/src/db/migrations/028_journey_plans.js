/** Migration 028: personalised journey plans.
 *
 *  One row per generated plan; the newest row for a user is their live plan.
 *  Regenerating inserts rather than updates, so a bad generation can be rolled
 *  back by deleting one row. Progress is still computed on read from sessions —
 *  there are no per-task progress rows here on purpose.
 */
exports.up = (pgm) => {
  pgm.createTable('journey_plans', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    plan: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  // "newest plan for this user" and "how many did they generate today" (rate limit).
  pgm.createIndex('journey_plans', ['user_id', { name: 'created_at', sort: 'DESC' }]);
};

exports.down = (pgm) => {
  pgm.dropTable('journey_plans');
};
