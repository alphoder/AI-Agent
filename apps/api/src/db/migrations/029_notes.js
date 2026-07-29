/** Migration 029: the global notes dock.
 *
 *  ONE table for three things, keyed by shape rather than a type enum:
 *    - a written note      = body set, at_sec null
 *    - a mid-call marker   = body empty, at_sec set (the call clock)
 *    - an AI note          = source 'ai'
 *  Notes are strictly private: every query filters on user_id. No sharing, no
 *  workspace visibility (YAGNI, and a moderation surface we do not want).
 */
exports.up = (pgm) => {
  pgm.createTable('notes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    body: { type: 'text', notNull: true, default: '' },
    // Where it was written: 'module' | 'session' | 'page'.
    context_type: { type: 'varchar(16)', notNull: true, default: 'page' },
    // Scenario id, session id, or null for a bare page note.
    context_id: { type: 'uuid' },
    // Free-text route/label so a page note can say where it came from.
    context_label: { type: 'varchar(120)' },
    // Seconds into the call, for markers dropped mid-session.
    at_sec: { type: 'integer' },
    source: { type: 'varchar(8)', notNull: true, default: 'user' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('notes', 'notes_source_check', "CHECK (source IN ('user','ai'))");
  pgm.addConstraint('notes', 'notes_context_type_check', "CHECK (context_type IN ('module','session','page'))");
  // The dock's two reads: "my newest notes" and "my notes for this context".
  pgm.createIndex('notes', ['user_id', { name: 'created_at', sort: 'DESC' }]);
  pgm.createIndex('notes', ['user_id', 'context_type', 'context_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('notes');
};
