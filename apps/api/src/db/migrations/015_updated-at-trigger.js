/**
 * Migration 015: Updated_at trigger function
 * Automatically updates updated_at timestamp on row modification
 */
exports.up = (pgm) => {
  // Create the trigger function
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Apply trigger to all tables with updated_at column
  const tables = ['tenants', 'users', 'avatars', 'personas', 'scenarios'];

  tables.forEach((table) => {
    pgm.sql(`
      CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  });
};

exports.down = (pgm) => {
  const tables = ['tenants', 'users', 'avatars', 'personas', 'scenarios'];

  tables.forEach((table) => {
    pgm.sql(`DROP TRIGGER IF EXISTS set_updated_at ON ${table};`);
  });

  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column();');
};
