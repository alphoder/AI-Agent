/**
 * Migration 024: Wallets — prepaid practice minutes (stored as seconds).
 * Every voice call debits duration; top-ups/bonuses credit. During beta,
 * WALLET_ENFORCE=false means balances are informational only (nothing blocks),
 * but the ledger still records real usage so we learn true burn rates.
 */
exports.up = (pgm) => {
  pgm.createTable('wallets', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users(id)', onDelete: 'CASCADE' },
    balance_seconds: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('wallet_transactions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('generate_uuidv7()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    delta_seconds: { type: 'integer', notNull: true }, // + credit, - debit
    reason: { type: 'varchar(40)', notNull: true },    // starter | call | topup | streak_bonus | referral | allocation
    ref: { type: 'varchar(80)' },                      // e.g. session id / order id
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('wallet_transactions', ['user_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('wallet_transactions');
  pgm.dropTable('wallets');
};
