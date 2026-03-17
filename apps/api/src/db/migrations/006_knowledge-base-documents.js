/**
 * Migration 006: Knowledge Base Documents table
 * Documents uploaded for RAG-enabled personas
 */
exports.up = (pgm) => {
  pgm.createTable('knowledge_base_documents', {
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
    persona_id: {
      type: 'uuid',
      notNull: true,
      references: 'personas(id)',
      onDelete: 'CASCADE',
    },
    original_filename: { type: 'varchar(500)', notNull: true },
    s3_key: { type: 'text', notNull: true },
    file_type: {
      type: 'varchar(10)',
      notNull: true,
      check: "file_type IN ('pdf', 'docx', 'txt', 'md')",
    },
    file_size_bytes: { type: 'bigint', notNull: true },
    chunk_count: { type: 'integer' },
    total_tokens: { type: 'integer' },
    embedding_status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'pending'",
      check: "embedding_status IN ('pending', 'processing', 'complete', 'failed')",
    },
    embedding_error: { type: 'text' },
    processing_started_at: { type: 'timestamptz' },
    processing_completed_at: { type: 'timestamptz' },
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
  });

  pgm.createIndex('knowledge_base_documents', 'tenant_id');
  pgm.createIndex('knowledge_base_documents', 'persona_id');
  pgm.createIndex('knowledge_base_documents', 'embedding_status');
};

exports.down = (pgm) => {
  pgm.dropTable('knowledge_base_documents');
};
