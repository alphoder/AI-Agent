/**
 * Migration 009: Sessions table
 * Training session records with LiveKit and avatar tracking
 */
exports.up = (pgm) => {
  pgm.createTable('sessions', {
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
    assignment_id: {
      type: 'uuid',
      notNull: true,
      references: 'scenario_assignments(id)',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
    },
    scenario_id: {
      type: 'uuid',
      notNull: true,
      references: 'scenarios(id)',
    },
    livekit_room_id: { type: 'varchar(255)' },
    simli_session_id: { type: 'varchar(255)' },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'created'",
      check: "status IN ('created', 'active', 'completed', 'timed_out', 'error')",
    },
    started_at: { type: 'timestamptz' },
    ended_at: { type: 'timestamptz' },
    duration_sec: { type: 'integer' },
    total_turns: { type: 'integer' },
    learner_token_count: { type: 'integer' },
    avatar_token_count: { type: 'integer' },
    avg_latency_ms: { type: 'numeric(10,2)' },
    error_message: { type: 'text' },
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

  pgm.createIndex('sessions', 'tenant_id');
  pgm.createIndex('sessions', 'assignment_id');
  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('sessions');
};
