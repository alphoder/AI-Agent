/**
 * Migration 023: Workspaces / Teams.
 * A workspace is a team a leader creates; members join with a code. Leaders
 * assign scenarios as "tests"; members practise them and appear on the contest
 * leaderboard (ranked from their sessions + scores).
 */
exports.up = (pgm) => {
  pgm.createTable('workspaces', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    name: { type: 'varchar(120)', notNull: true },
    join_code: { type: 'varchar(12)', notNull: true, unique: true },
    created_by: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('workspace_members', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    workspace_id: { type: 'uuid', notNull: true, references: 'workspaces(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    role: { type: 'varchar(16)', notNull: true, default: 'member' }, // 'leader' | 'member'
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('workspace_members', 'workspace_members_unique', 'UNIQUE(workspace_id, user_id)');
  pgm.createIndex('workspace_members', 'user_id');

  pgm.createTable('workspace_assignments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    workspace_id: { type: 'uuid', notNull: true, references: 'workspaces(id)', onDelete: 'CASCADE' },
    scenario_id: { type: 'uuid', notNull: true, references: 'scenarios(id)', onDelete: 'CASCADE' },
    assigned_by: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    note: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('workspace_assignments', 'workspace_id');
};

exports.down = (pgm) => {
  pgm.dropTable('workspace_assignments');
  pgm.dropTable('workspace_members');
  pgm.dropTable('workspaces');
};
