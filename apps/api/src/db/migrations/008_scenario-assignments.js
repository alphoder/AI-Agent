/**
 * Migration 008: Scenario Assignments table
 * Links scenarios to learners with tracking
 */
exports.up = (pgm) => {
  pgm.createTable('scenario_assignments', {
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
    scenario_id: {
      type: 'uuid',
      notNull: true,
      references: 'scenarios(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    due_date: { type: 'timestamptz' },
    assigned_by: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'assigned'",
      check: "status IN ('assigned', 'in_progress', 'completed')",
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
  });

  pgm.createIndex('scenario_assignments', ['scenario_id', 'user_id'], { unique: true });
  pgm.createIndex('scenario_assignments', 'tenant_id');
  pgm.createIndex('scenario_assignments', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('scenario_assignments');
};
