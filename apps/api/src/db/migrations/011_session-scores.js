/**
 * Migration 011: Session Scores table
 * AI-generated evaluation scores per session
 */
exports.up = (pgm) => {
  pgm.createTable('session_scores', {
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
      unique: true,
    },
    overall_score: {
      type: 'numeric(5,2)',
      notNull: true,
      check: 'overall_score >= 0 AND overall_score <= 100',
    },
    criteria_scores: { type: 'jsonb', notNull: true },
    strengths: { type: 'text[]', notNull: true, default: '{}' },
    improvements: { type: 'text[]', notNull: true, default: '{}' },
    narrative_feedback: { type: 'text' },
    scored_by_model: { type: 'varchar(100)', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('session_scores', 'session_id');
};

exports.down = (pgm) => {
  pgm.dropTable('session_scores');
};
