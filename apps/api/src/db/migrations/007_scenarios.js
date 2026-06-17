/**
 * Migration 007: Scenarios table
 * Training scenarios with scoring rubrics
 */
exports.up = (pgm) => {
  pgm.createTable('scenarios', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('generate_uuidv7()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants(id)',
      onDelete: 'CASCADE',
    },
    persona_id: {
      type: 'uuid',
      notNull: true,
      references: 'personas(id)',
    },
    title: { type: 'varchar(500)', notNull: true },
    description: { type: 'text' },
    objective: { type: 'text', notNull: true },
    opening_context: { type: 'text' },
    opening_message: { type: 'text' },
    scoring_rubric: { type: 'jsonb', notNull: true },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'draft'",
      check: "status IN ('draft', 'active', 'archived')",
    },
    max_duration_sec: { type: 'integer', notNull: true, default: 600 },
    max_turns: { type: 'integer', notNull: true, default: 50 },
    difficulty_level: {
      type: 'varchar(20)',
      notNull: true,
      default: "'intermediate'",
      check: "difficulty_level IN ('beginner', 'intermediate', 'advanced')",
    },
    tags: { type: 'text[]', default: '{}' },
    created_by: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex('scenarios', 'tenant_id');
  pgm.createIndex('scenarios', 'persona_id');
  pgm.createIndex('scenarios', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('scenarios');
};
