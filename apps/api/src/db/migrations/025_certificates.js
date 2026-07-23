/**
 * Migration 025: Certificates — issued when every lesson in a journey unit
 * reaches silver mastery. One row per user per unit; the PDF renders client-side.
 */
exports.up = (pgm) => {
  pgm.createTable('certificates', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    unit_key: { type: 'varchar(40)', notNull: true },
    issued_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('certificates', 'certificates_user_unit_unique', { unique: ['user_id', 'unit_key'] });
};

exports.down = (pgm) => {
  pgm.dropTable('certificates');
};
