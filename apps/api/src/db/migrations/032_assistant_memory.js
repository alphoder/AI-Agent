/** Migration 031: Bixy's 24-hour conversation memory.
 *
 * Everything the voice assistant and the user say to each other lands here —
 * one row per turn, per speaker — and auto-expires 24 hours after it is
 * recorded (default expires_at = created_at + 24h).
 *
 * This is deliberately NOT part of the assistant's context: it is a second,
 * short-term memory queried only when the model calls the recall_memory tool
 * (e.g. "do you remember what we talked about?"). Rows past their TTL are
 * deleted by the internal routes on read/write and by a periodic sweep in
 * index.ts.
 */
exports.up = (pgm) => {
  pgm.createTable('assistant_memory', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    role: { type: 'varchar(16)', notNull: true },
    text: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    expires_at: { type: 'timestamptz', notNull: true, default: pgm.func("NOW() + INTERVAL '24 hours'") },
  });
  pgm.addConstraint('assistant_memory', 'assistant_memory_role_check', "CHECK (role IN ('user','assistant'))");
  // The two reads: "my recent memory" and "sweep what expired".
  pgm.createIndex('assistant_memory', ['user_id', { name: 'created_at', sort: 'DESC' }]);
  pgm.createIndex('assistant_memory', ['expires_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('assistant_memory');
};
