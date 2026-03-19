/**
 * Migration 016: Row-Level Security (RLS)
 * Enables tenant isolation on all tenant-scoped tables
 * Uses current_setting('app.current_tenant_id') set per-request
 */
exports.up = (pgm) => {
  const tenantScopedTables = [
    'users',
    'avatars',
    'personas',
    'knowledge_base_documents',
    'scenarios',
    'scenario_assignments',
    'sessions',
    'session_transcripts',
    'session_scores',
    'lti_platforms',
    'lti_nonces',
    'audit_logs',
  ];

  tenantScopedTables.forEach((table) => {
    // Enable RLS
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);

    // Create tenant isolation policy
    // Uses current_setting with a default to prevent errors when not set
    if (table === 'session_transcripts' || table === 'session_scores') {
      // These tables don't have a direct tenant_id, join through sessions
      pgm.sql(`
        CREATE POLICY tenant_isolation ON ${table}
        USING (
          session_id IN (
            SELECT id FROM sessions
            WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
          )
        );
      `);
    } else if (table === 'lti_nonces') {
      // lti_nonces doesn't have tenant_id, join through lti_platforms
      pgm.sql(`
        CREATE POLICY tenant_isolation ON ${table}
        USING (
          platform_id IN (
            SELECT id FROM lti_platforms
            WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
          )
        );
      `);
    } else {
      pgm.sql(`
        CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      `);
    }
  });

  // Force RLS for table owners too (important for security)
  tenantScopedTables.forEach((table) => {
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
  });
};

exports.down = (pgm) => {
  const tenantScopedTables = [
    'users',
    'avatars',
    'personas',
    'knowledge_base_documents',
    'scenarios',
    'scenario_assignments',
    'sessions',
    'session_transcripts',
    'session_scores',
    'lti_platforms',
    'lti_nonces',
    'audit_logs',
  ];

  tenantScopedTables.forEach((table) => {
    pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON ${table};`);
    pgm.sql(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
  });
};
