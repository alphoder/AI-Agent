/** Migration 026: workspace minute pool — the org buys minutes centrally and
 *  leaders allocate them to members (wallet txn reason 'allocation'). */
exports.up = (pgm) => {
  pgm.addColumn('workspaces', { pool_seconds: { type: 'integer', notNull: true, default: 0 } });
};
exports.down = (pgm) => {
  pgm.dropColumn('workspaces', 'pool_seconds');
};
