/**
 * Migration 010: Session Transcripts table
 * Per-turn conversation records with metadata
 */
exports.up = (pgm) => {
  pgm.createTable('session_transcripts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('generate_uuidv7()'),
    },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'sessions(id)',
      onDelete: 'CASCADE',
    },
    turn_number: { type: 'integer', notNull: true },
    role: {
      type: 'varchar(10)',
      notNull: true,
      check: "role IN ('learner', 'avatar', 'system')",
    },
    content: { type: 'text', notNull: true },
    stt_confidence: { type: 'numeric(5,4)' },
    tokens_used: { type: 'integer' },
    rag_chunks_used: { type: 'integer' },
    guardrail_triggered: { type: 'boolean', notNull: true, default: false },
    latency_ms: { type: 'numeric(10,2)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('session_transcripts', 'session_id');
  pgm.createIndex('session_transcripts', ['session_id', 'turn_number']);
};

exports.down = (pgm) => {
  pgm.dropTable('session_transcripts');
};
