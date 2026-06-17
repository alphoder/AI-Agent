/**
 * Migration 004: Avatars table
 * AI avatar entities with provider configuration
 */
exports.up = (pgm) => {
  pgm.createTable('avatars', {
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
    name: { type: 'varchar(255)', notNull: true },
    provider: {
      type: 'varchar(10)',
      notNull: true,
      check: "provider IN ('simli', 'heygen')",
    },
    provider_avatar_id: { type: 'varchar(255)' },
    source_image_url: { type: 'text', notNull: true },
    thumbnail_url: { type: 'text' },
    config: { type: 'jsonb', default: '{}' },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'processing'",
      check: "status IN ('active', 'inactive', 'processing', 'failed')",
    },
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

  pgm.createIndex('avatars', 'tenant_id');
  pgm.createIndex('avatars', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('avatars');
};
