/** Migration 030: the client dossier shown on a scenario's Learn step.
 *
 *  One JSONB blob per scenario holding {brief, quiz, exchange}. It is generated
 *  once from the persona (see db/generate-briefs.ts) and committed to
 *  packages/shared/src/briefs.ts, so the seed can restore it and a re-seed never
 *  loses it. Null simply means "not generated yet" and the page falls back to the
 *  scenario description.
 */
exports.up = (pgm) => {
  pgm.addColumns('scenarios', {
    client_brief: { type: 'jsonb' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('scenarios', ['client_brief']);
};
