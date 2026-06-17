/**
 * Migration 012: LTI Platforms table
 * LMS platform registration for LTI 1.3
 */
exports.up = (pgm) => {
  pgm.createTable('lti_platforms', {
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
    issuer: { type: 'text', notNull: true },
    client_id: { type: 'varchar(255)', notNull: true },
    auth_endpoint: { type: 'text', notNull: true },
    token_endpoint: { type: 'text', notNull: true },
    jwks_endpoint: { type: 'text', notNull: true },
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

  pgm.createIndex('lti_platforms', 'tenant_id');
  pgm.createIndex('lti_platforms', ['issuer', 'client_id'], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable('lti_platforms');
};
