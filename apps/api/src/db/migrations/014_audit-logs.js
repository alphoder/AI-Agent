/**
 * Migration 014: Audit Logs table
 * System-wide audit trail for compliance
 */
exports.up = (pgm) => {
  pgm.createTable('audit_logs', {
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
    user_id: {
      type: 'uuid',
      references: 'users(id)',
    },
    action: { type: 'varchar(100)', notNull: true },
    resource_type: { type: 'varchar(100)', notNull: true },
    resource_id: { type: 'uuid' },
    details: { type: 'jsonb', default: '{}' },
    ip_address: { type: 'inet' },
    user_agent: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('audit_logs', 'tenant_id');
  pgm.createIndex('audit_logs', 'user_id');
  pgm.createIndex('audit_logs', 'action');
  pgm.createIndex('audit_logs', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('audit_logs');
};
