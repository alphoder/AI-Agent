/**
 * Migration 013: LTI Nonces table
 * Replay prevention for LTI 1.3 launches
 */
exports.up = (pgm) => {
  pgm.createTable('lti_nonces', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('generate_uuidv7()'),
    },
    nonce: { type: 'varchar(255)', notNull: true, unique: true },
    platform_id: {
      type: 'uuid',
      notNull: true,
      references: 'lti_platforms(id)',
      onDelete: 'CASCADE',
    },
    consumed: { type: 'boolean', notNull: true, default: false },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('lti_nonces', 'nonce');
  pgm.createIndex('lti_nonces', 'expires_at');
};

exports.down = (pgm) => {
  pgm.dropTable('lti_nonces');
};
