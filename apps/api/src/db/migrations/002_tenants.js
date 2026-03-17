/**
 * Migration 002: Tenants table
 * Core multi-tenancy entity with SSO config and platform settings
 */
exports.up = (pgm) => {
  pgm.createTable('tenants', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('generate_uuidv7()'),
    },
    name: { type: 'varchar(255)', notNull: true },
    slug: { type: 'varchar(100)', notNull: true, unique: true },
    sso_provider: {
      type: 'varchar(10)',
      notNull: true,
      check: "sso_provider IN ('saml', 'oidc')",
    },
    sso_metadata_url: { type: 'text' },
    sso_client_id: { type: 'varchar(255)' },
    sso_client_secret_encrypted: { type: 'text' },
    sso_config: { type: 'jsonb', default: '{}' },
    avatar_provider: {
      type: 'varchar(10)',
      notNull: true,
      default: "'simli'",
      check: "avatar_provider IN ('simli', 'heygen')",
    },
    max_concurrent_sessions: { type: 'integer', notNull: true, default: 50 },
    session_duration_limit_sec: { type: 'integer', notNull: true, default: 1200 },
    idle_timeout_sec: { type: 'integer', notNull: true, default: 60 },
    data_retention_days: { type: 'integer', notNull: true, default: 365 },
    is_active: { type: 'boolean', notNull: true, default: true },
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

  pgm.createIndex('tenants', 'slug');
};

exports.down = (pgm) => {
  pgm.dropTable('tenants');
};
