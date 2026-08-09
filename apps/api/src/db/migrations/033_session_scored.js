/**
 * Migration 033: sessions.scored
 *
 * Whether an ended session was sent to report generation. Mirrors the scoring
 * rule: customer-ended calls are always scored; learner-ended calls only when
 * they ran at least SESSION_MIN_REPORT_SEC (60s). Persisting the decision lets
 * the reports UI show "call too short" immediately instead of polling forever
 * for a report that will never exist — and keeps customer-hung-up short calls
 * (which ARE scored) out of the "too short" bucket.
 */
exports.up = (pgm) => {
  pgm.addColumns('sessions', {
    scored: { type: 'boolean' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('sessions', ['scored']);
};
