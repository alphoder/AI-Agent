/** The curriculum spine: units -> ordered lessons, each lesson = one seeded
 *  scenario (referenced by title — the seed is idempotent on title). Static by
 *  design (ponytail: curriculum is content, not data — no tables, no admin UI;
 *  edit this file to change the path). Progress is computed at read time from
 *  sessions + session_scores, so there is nothing to migrate or sync. */

export interface JourneyLesson {
  key: string;       // stable id, e.g. 'opening-1'
  scenario: string;  // seed scenario title (exact match)
}

export interface JourneyUnit {
  key: string;
  title: string;
  drills: string;    // what this unit teaches, one line
  do: string[];      // briefing: what to do (the technique)
  dont: string[];    // briefing: the traps
  lessons: JourneyLesson[];
}

/** Mastery thresholds on best overall score (0-100). */
export const MASTERY = { bronze: 50, silver: 70, gold: 85 } as const;
export type Mastery = 'none' | 'bronze' | 'silver' | 'gold';

export function masteryFor(best: number | null): Mastery {
  if (best == null) return 'none';
  if (best >= MASTERY.gold) return 'gold';
  if (best >= MASTERY.silver) return 'silver';
  if (best >= MASTERY.bronze) return 'bronze';
  return 'none';
}

export const JOURNEY: JourneyUnit[] = [
  {
    key: 'opening', title: 'The Opening',
    drills: 'Earning the first thirty seconds — getting past "I\'m busy" and "not interested".',
    do: [
      'Respect their time out loud ("sixty seconds, then cut me off")',
      'Give a hook that is about THEIR situation, not your product',
      'Ask permission to continue — and mean it',
    ],
    dont: [
      'Launch into a pitch before they agree to listen',
      'Push harder after a brush-off — that ends calls',
      'Sound like a script; they can hear it',
    ],
    lessons: [
      { key: 'opening-1', scenario: 'Home Insurance — Post-Disaster Call' },
      { key: 'opening-2', scenario: 'Crop Insurance — Skeptical Farmer' },
      { key: 'opening-3', scenario: 'Cyber Insurance — Digital Retailer' },
      { key: 'opening-4', scenario: 'Term Life — Cold Call' },
    ],
  },
  {
    key: 'discovery', title: 'Discovery',
    drills: 'Needs-based questioning — understand before you sell (the foundation of compliant advice).',
    do: [
      'Ask about family, income, dependants and existing cover BEFORE any product talk',
      'Follow up on their answers — one good probe beats five questions',
      'Let silence work; people fill it with the truth',
    ],
    dont: [
      'Pitch in your first three turns',
      'Interrogate — it is a conversation, not a form',
      'Assume the need; surface it',
    ],
    lessons: [
      { key: 'discovery-1', scenario: 'Child Education Plan' },
      { key: 'discovery-2', scenario: 'Shopkeeper Package — Multi-Peril Retail' },
      { key: 'discovery-3', scenario: 'Family Term Plan — Young Parent' },
      { key: 'discovery-4', scenario: 'Group Health Insurance — SME Pitch' },
    ],
  },
  {
    key: 'pitch', title: 'The Pitch',
    drills: 'Matching the product to a stated need — selling value, not features.',
    do: [
      'Tie every benefit to something THEY said',
      'Use one relatable example instead of three statistics',
      'Explain in their words; check they understood',
    ],
    dont: [
      'Feature-dump — nobody buys a list',
      'Use jargon they never asked about',
      'Oversell; a modest true claim beats a grand vague one',
    ],
    lessons: [
      { key: 'pitch-1', scenario: 'Savings / Endowment Plan — Maturity & Tax' },
      { key: 'pitch-2', scenario: 'Restaurant Public Liability' },
      { key: 'pitch-3', scenario: 'Marine Cargo — Export Transit Cover' },
      { key: 'pitch-4', scenario: 'Keyman Insurance — B2B SME Pitch' },
    ],
  },
  {
    key: 'objections', title: 'Objection Handling',
    drills: '"Too expensive", "I already have a policy", "let me think" — validate, then resolve.',
    do: [
      'Acknowledge the objection as reasonable before answering it',
      'Answer the REAL concern underneath, not just the words',
      'Trade value for value — never just discount',
    ],
    dont: [
      'Argue or get defensive — you lose even if you win',
      'Fold at the first pushback',
      'Ignore it and repeat the pitch louder',
    ],
    lessons: [
      { key: 'objections-1', scenario: 'Critical Illness — Exclusion Concern' },
      { key: 'objections-2', scenario: 'Health Insurance — Price Objection' },
      { key: 'objections-3', scenario: 'Retirement Annuity vs. Fixed Deposit' },
    ],
  },
  {
    key: 'compliance', title: 'Compliance & Ethics',
    drills: 'Disclosures, exclusions, no over-promised returns — selling that survives an audit.',
    do: [
      'State waiting periods, exclusions and charges up front',
      'When tempted with "so it\'s guaranteed, right?" — correct it clearly',
      'Recommend LESS when less is what fits',
    ],
    dont: [
      'Promise or imply guaranteed returns on market products',
      'Hide the fine print until after the yes',
      'Sell a product that does not fit the need',
    ],
    lessons: [
      { key: 'compliance-1', scenario: 'ULIP / Investment Plan — Confused Customer' },
      { key: 'compliance-2', scenario: 'Senior Citizen Health Plan — Trust & Clarity' },
      { key: 'compliance-3', scenario: 'Credit-Linked Cover — Loan Protection' },
    ],
  },
  {
    key: 'closing', title: 'Closing',
    drills: 'Asking for the sale, handling the final hesitation, locking a real next step.',
    do: [
      'Ask clearly for a specific commitment with a date',
      'Make the next step small and easy to say yes to',
      'Surface the real hesitation behind "I\'ll think about it"',
    ],
    dont: [
      'Pressure or fake urgency — it reads as desperation',
      'Accept a vague "maybe" as a close',
      'Keep selling after they have already said yes',
    ],
    lessons: [
      { key: 'closing-1', scenario: 'Motor Insurance — Renewal + Add-ons' },
      { key: 'closing-2', scenario: 'Group Health Renewal — Copay Dispute' },
      { key: 'closing-3', scenario: 'Follow-up Close — "I will think about it"' },
      { key: 'closing-4', scenario: 'Directors & Officers (D&O) — Series A CEO' },
    ],
  },
  {
    key: 'service', title: 'Renewals & Service',
    drills: 'The angry renewal and the worried claimant — keeping trust when it is hardest.',
    do: [
      'Let them vent fully before you explain anything',
      'Acknowledge loyalty and feelings explicitly',
      'Resolve first; only earn the right to sell after',
    ],
    dont: [
      'Get defensive about the company',
      'Cross-sell to someone who is still upset',
      'Hide behind policy language',
    ],
    lessons: [
      { key: 'service-1', scenario: 'Motor Renewal — Angry About Premium Hike' },
      { key: 'service-2', scenario: 'Claim Worry + Cross-sell' },
    ],
  },
  {
    key: 'growth-1', title: 'Client Growth I — Trust & Whitespace',
    drills: 'Neuro-selling and whitespace mapping — lower the guard, find the unserved need.',
    do: [
      'Create safety before making any case — read their mood first',
      'Explore adjacent needs with curiosity, not a scope-grab',
      'Name their risk before your proposal',
    ],
    dont: [
      'Lead with logic on a defensive stakeholder',
      'Fish for org charts and budgets — earn them',
      'Mistake comfort for agreement',
    ],
    lessons: [
      { key: 'growth1-1', scenario: 'Neuro Selling — The Overloaded VP' },
      { key: 'growth1-2', scenario: 'Neuro Selling — The Comfortable COO' },
      { key: 'growth1-3', scenario: 'Whitespace — The Single-Service Client' },
      { key: 'growth1-4', scenario: 'Neuro Selling — The Defensive CFO' },
      { key: 'growth1-5', scenario: 'Whitespace — The Guarded Process Owner' },
      { key: 'growth1-6', scenario: 'Whitespace — The Fragmented Enterprise' },
    ],
  },
  {
    key: 'growth-2', title: 'Client Growth II — Conversations & The Cookie',
    drills: 'Elevate past status updates, and leave real value behind in every interaction.',
    do: [
      'Bring one specific, credible insight to every meeting',
      'Reframe metrics reviews around THEIR business outcomes',
      'Admit the limits of your data — rigor earns champions',
    ],
    dont: [
      'Walk in with only a status deck',
      'Pitch when asked for insight',
      'Claim "industry best practice" without a source',
    ],
    lessons: [
      { key: 'growth2-1', scenario: 'Meaningful Conversations — The Status-Update Trap' },
      { key: 'growth2-2', scenario: 'The Cookie — "So, What Have You Got For Me?"' },
      { key: 'growth2-3', scenario: 'Meaningful Conversations — The Transactional Procurement Head' },
      { key: 'growth2-4', scenario: 'The Cookie — The Benchmark Skeptic' },
      { key: 'growth2-5', scenario: 'Meaningful Conversations — The Inherited Stakeholder' },
      { key: 'growth2-6', scenario: 'The Cookie — The Innovation-Fatigued CIO' },
    ],
  },
];

/** Flat list of every lesson with its unit (handy for lookups). */
export const ALL_LESSONS = JOURNEY.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u.key })));
