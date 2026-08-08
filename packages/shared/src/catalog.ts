/**
 * The scenario browse structure: category → track → scenarios.
 *
 * ponytail: this is **derived from the tags scenarios already carry**, not a new
 * column and not a re-seed. Adding a category later means editing this file.
 *
 * Matching is first-hit-wins in declaration order, so put the specific categories
 * above the general ones (client growth before sales: its scenarios also carry
 * generic selling tags).
 */

export interface CatalogTrack {
  key: string;
  label: string;
  blurb: string;
  /** Tags that put a scenario in this track. Empty = the catch-all for the category. */
  match: string[];
}

export interface CatalogCategory {
  key: string;
  label: string;
  blurb: string;
  /** Committed asset, generated once. See web/public/categories/. */
  image: string;
  match: string[];
  tracks: CatalogTrack[];
}

export const CATEGORIES: CatalogCategory[] = [
  {
    key: 'client-growth',
    label: 'Client Growth',
    blurb: 'Grow the accounts you already have.',
    image: '/categories/client-growth.webp',
    match: ['client-growth'],
    tracks: [
      { key: 'neuro-selling', label: 'Neuro Selling', blurb: 'Reach the decision behind the decision.', match: ['neuro-selling'] },
      { key: 'whitespace', label: 'Whitespace', blurb: 'Find the work nobody has asked for yet.', match: ['whitespace'] },
      { key: 'cookie', label: 'The Cookie', blurb: 'Lead with an insight they cannot ignore.', match: ['cookie-insight'] },
      { key: 'meaningful', label: 'Meaningful Conversations', blurb: 'Turn status updates into real dialogue.', match: ['meaningful-conversations'] },
      { key: 'more', label: 'More', blurb: 'Everything else in this track.', match: [] },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    blurb: 'Insurance and BFSI calls, from first hello to signed.',
    image: '/categories/sales.webp',
    match: [], // the default home for the seeded library
    tracks: [
      { key: 'cold-calls', label: 'Cold Calls', blurb: 'Earn the first thirty seconds.', match: ['cold-call'] },
      // Declared before renewals and objections on purpose: these rows also carry
      // 'cross-sell' and 'objection-handling', and first-hit-wins would swallow them.
      { key: 'banca', label: 'Bancassurance', blurb: 'They came in for banking, not insurance.', match: ['bancassurance'] },
      { key: 'compliance', label: 'Compliance & Ethics', blurb: 'The sale you are supposed to lose.', match: ['compliance', 'mis-selling', 'suitability'] },
      { key: 'objections', label: 'Objections', blurb: 'Price, doubt and "I will think about it".', match: ['objection-handling', 'closing', 'follow-up'] },
      { key: 'renewals', label: 'Renewals & Service', blurb: 'Keep them, and grow them.', match: ['renewal', 'retention', 'upsell', 'claims', 'service', 'cross-sell'] },
      { key: 'commercial', label: 'Commercial & B2B', blurb: 'Businesses, not households.', match: ['b2b', 'sme', 'group', 'keyman', 'logistics', 'startup'] },
      { key: 'personal', label: 'Personal Lines', blurb: 'Families, savings and health cover.', match: [] },
    ],
  },
  {
    key: 'interview',
    label: 'Interview',
    blurb: 'Answer without freezing.',
    image: '/categories/interview.webp',
    match: ['interview'],
    tracks: [
      { key: 'screening', label: 'The Screen', blurb: 'Recruiter, HR and technical first rounds.', match: ['screening', 'technical-screen', 'technical'] },
      { key: 'hiring-manager', label: 'Hiring Manager', blurb: 'The person you would report to.', match: ['hiring-manager'] },
      { key: 'behavioural', label: 'Behavioural', blurb: 'Tell me about a time when.', match: ['behavioural'] },
      { key: 'salary', label: 'Salary', blurb: 'Ask for the number.', match: ['salary'] },
      { key: 'more', label: 'More', blurb: 'Everything else in this track.', match: [] },
    ],
  },
  {
    key: 'support',
    label: 'Customer Support',
    blurb: 'Handle people when things have gone wrong.',
    image: '/categories/support.webp',
    match: ['support', 'de-escalation'],
    tracks: [
      { key: 'angry', label: 'Angry Customers', blurb: 'Take the heat, keep the customer.', match: ['angry'] },
      { key: 'escalation', label: 'Escalations', blurb: 'When it has already gone up a level.', match: ['escalation'] },
      { key: 'save', label: 'Saves', blurb: 'They have one foot out of the door.', match: ['save'] },
      { key: 'more', label: 'More', blurb: 'Everything else in this track.', match: [] },
    ],
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    blurb: 'Hold your position without losing the room.',
    image: '/categories/negotiation.webp',
    // 'negotiation' is now the category tag (the one insurance renewal that used to
    // carry it was retagged in the seed, so it stays in Sales where it belongs).
    // 'pricing' is here as well as on the track: a price negotiation is not a sale.
    match: ['negotiation', 'vendor', 'procurement', 'contract-terms', 'pricing'],
    tracks: [
      { key: 'pricing', label: 'Pricing', blurb: 'Defend the number.', match: ['pricing'] },
      { key: 'vendor', label: 'Vendors', blurb: 'Buying, not selling.', match: ['vendor', 'procurement'] },
      { key: 'terms', label: 'Terms', blurb: 'Contracts, scope and the fine print.', match: ['contract', 'terms'] },
      { key: 'more', label: 'More', blurb: 'Everything else in this track.', match: [] },
    ],
  },
  {
    key: 'leadership',
    label: 'Leadership',
    blurb: 'The conversations managers put off.',
    image: '/categories/leadership.webp',
    match: ['management', 'delegation'],
    tracks: [
      { key: 'feedback', label: 'Feedback', blurb: 'Say the hard thing well.', match: ['feedback'] },
      { key: 'performance', label: 'Performance', blurb: 'When the work is not good enough.', match: ['performance'] },
      { key: 'conflict', label: 'Conflict', blurb: 'Two people, one problem.', match: ['conflict'] },
      { key: 'saying-no', label: 'Saying No', blurb: 'Decline without damage.', match: ['saying-no'] },
      { key: 'more', label: 'More', blurb: 'Everything else in this track.', match: [] },
    ],
  },
  {
    key: 'speaking',
    label: 'Public Speaking',
    blurb: 'Pitches, demos and the questions after.',
    image: '/categories/speaking.webp',
    match: ['public-speaking', 'pitch', 'presentation'],
    tracks: [
      { key: 'pitch', label: 'The Pitch', blurb: 'Make them care in two minutes.', match: ['pitch'] },
      { key: 'demo', label: 'Demos', blurb: 'Show it without narrating it.', match: ['demo'] },
      { key: 'stakeholder', label: 'Stakeholder Updates', blurb: 'Report up, briefly.', match: ['stakeholder'] },
      { key: 'qa', label: 'Q&A', blurb: 'The part you cannot script.', match: ['q-and-a'] },
      { key: 'more', label: 'More', blurb: 'Everything else in this track.', match: [] },
    ],
  },
  {
    key: 'confidence',
    label: 'Everyday Confidence',
    blurb: 'Speak up when it is not a meeting.',
    image: '/categories/confidence.webp',
    match: ['social', 'small-talk', 'networking', 'clarity'],
    tracks: [
      { key: 'networking', label: 'Networking', blurb: 'Start with a stranger.', match: ['networking'] },
      { key: 'small-talk', label: 'Small Talk', blurb: 'The first two minutes.', match: ['small-talk'] },
      { key: 'introductions', label: 'Introducing Yourself', blurb: 'Say what you do, clearly.', match: ['introduction'] },
      { key: 'fluency', label: 'Fluency', blurb: 'Fewer fillers, clearer sentences.', match: ['clarity', 'fluency'] },
      { key: 'more', label: 'More', blurb: 'Everything else in this track.', match: [] },
    ],
  },
];

const DEFAULT_CATEGORY = 'sales';

/** Which category a scenario belongs to. Declaration order decides ties. */
export function categoryFor(tags: string[] | null | undefined): string {
  const t = tags ?? [];
  for (const c of CATEGORIES) {
    if (c.match.length && t.some((tag) => c.match.includes(tag))) return c.key;
  }
  return DEFAULT_CATEGORY;
}

/** Which track inside a category. Falls back to that category's catch-all. */
export function trackFor(tags: string[] | null | undefined, categoryKey: string): string {
  const cat = CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return 'more';
  const t = tags ?? [];
  for (const tr of cat.tracks) {
    if (tr.match.length && t.some((tag) => tr.match.includes(tag))) return tr.key;
  }
  return cat.tracks[cat.tracks.length - 1]?.key ?? 'more';
}

export function categoryByKey(key: string): CatalogCategory | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

export function trackByKey(categoryKey: string, trackKey: string): CatalogTrack | undefined {
  return categoryByKey(categoryKey)?.tracks.find((t) => t.key === trackKey);
}
