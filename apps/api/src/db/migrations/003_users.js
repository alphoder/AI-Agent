/**
 * Migration 003: Users table
 * Tenant-scoped users with SSO external ID mapping
 */
exports.up = (pgm) => {
  pgm.createTable('users', {
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
    external_id: { type: 'varchar(255)' },
    email: { type: 'varchar(255)', notNull: true },
    display_name: { type: 'varchar(255)', notNull: true },
    role: {
      type: 'varchar(10)',
      notNull: true,
      check: "role IN ('admin', 'learner')",
    },
    is_active: { type: 'boolean', notNull: true, default: true },
    last_login_at: { type: 'timestamptz' },
    metadata: { type: 'jsonb', default: '{}' },
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

  pgm.createIndex('users', ['tenant_id', 'email'], { unique: true });
  pgm.createIndex('users', ['tenant_id', 'external_id'], {
    unique: true,
    where: 'external_id IS NOT NULL',
  });
  pgm.createIndex('users', 'tenant_id');
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
