/** Migration 027: white-label branding per workspace — the org's academy name
 *  and accent colour theme the module experience for its members. */
exports.up = (pgm) => {
  pgm.addColumns('workspaces', {
    academy_name: { type: 'varchar(80)' },
    accent_color: { type: 'varchar(9)' }, // #RRGGBB
    logo_url: { type: 'text' },
  });
};
exports.down = (pgm) => {
  pgm.dropColumns('workspaces', ['academy_name', 'accent_color', 'logo_url']);
};
