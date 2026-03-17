/**
 * Migration 005: Personas table
 * AI persona configuration with 1:1 avatar relationship
 */
exports.up = (pgm) => {
  pgm.createTable('personas', {
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
    description: { type: 'text' },
    avatar_id: {
      type: 'uuid',
      notNull: true,
      references: 'avatars(id)',
      unique: true,
    },
    system_prompt: { type: 'text', notNull: true },
    system_prompt_version: { type: 'integer', notNull: true, default: 1 },
    guardrails: {
      type: 'jsonb',
      notNull: true,
      default: JSON.stringify({
        allowed_topics: [],
        blocked_topics: [],
        escalation_triggers: [],
        max_response_tokens: 256,
        follow_up_question_frequency: 3,
      }),
    },
    rag_enabled: { type: 'boolean', notNull: true, default: false },
    rag_top_k: { type: 'integer', notNull: true, default: 5 },
    rag_similarity_threshold: { type: 'numeric(3,2)', notNull: true, default: 0.70 },
    temperature: { type: 'numeric(3,2)', notNull: true, default: 0.70 },
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

  pgm.createIndex('personas', 'tenant_id');
  pgm.createIndex('personas', 'avatar_id');
};

exports.down = (pgm) => {
  pgm.dropTable('personas');
};
