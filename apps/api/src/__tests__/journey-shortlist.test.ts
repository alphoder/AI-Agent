/**
 * The shortlist is what makes the journey personal, so it is the piece worth
 * testing: it decides which slice of 240 scenarios a given learner is ever
 * offered. Run against the real library, not fixtures — the point is that the
 * intake→category map and the seeded tags agree with each other.
 */
import { shortlist } from '../services/plan-shortlist';
import { MASTERY, categoryFor, type Intake } from '@avatar-platform/shared';
import { SALES_SCENARIOS } from '../db/scenarios/sales';
import { CLIENT_GROWTH_SCENARIOS } from '../db/scenarios/client-growth';
import { INTERVIEW_SCENARIOS } from '../db/scenarios/interview';
import { SUPPORT_SCENARIOS } from '../db/scenarios/support';
import { NEGOTIATION_SCENARIOS } from '../db/scenarios/negotiation';
import { LEADERSHIP_SCENARIOS } from '../db/scenarios/leadership';
import { SPEAKING_SCENARIOS } from '../db/scenarios/speaking';
import { CONFIDENCE_SCENARIOS } from '../db/scenarios/confidence';

// Stand in for the DB rows: same shape, real content, deterministic ids.
const CATALOGUE = [
  ...SALES_SCENARIOS, ...CLIENT_GROWTH_SCENARIOS, ...INTERVIEW_SCENARIOS, ...SUPPORT_SCENARIOS,
  ...NEGOTIATION_SCENARIOS, ...LEADERSHIP_SCENARIOS, ...SPEAKING_SCENARIOS, ...CONFIDENCE_SCENARIOS,
].map((s, i) => ({
  id: `id-${i}`,
  title: s.title,
  difficulty_level: s.difficulty_level,
  tags: s.tags,
  description: s.description,
}));

const intake = (over: Partial<Intake>): Intake => ({
  role: 'other', industry: 'other', experience: 'some', outcomes: ['fluency'],
  struggles: [], struggleNote: '', minutesPerDay: 15, daysPerWeek: 5,
  org: '', city: '', state: '', intensity: 'balanced', ...over,
});

const categoriesIn = (rows: { tags: string[] | null }[]) => new Set(rows.map((r) => categoryFor(r.tags)));

describe('journey shortlist', () => {
  it('gives a job seeker interview practice, not insurance cold calls', () => {
    const picked = shortlist(CATALOGUE, intake({ role: 'job_seeker', outcomes: ['interviews'] }), new Set());
    expect([...categoriesIn(picked)].sort()).toEqual(['confidence', 'interview']);
    expect(picked.length).toBeGreaterThan(20);
  });

  it('gives two different people two different weeks', () => {
    const seeker = shortlist(CATALOGUE, intake({ role: 'job_seeker', outcomes: ['interviews'] }), new Set());
    const manager = shortlist(CATALOGUE, intake({ role: 'manager', outcomes: ['hard_talks'] }), new Set());
    const overlap = seeker.filter((s) => manager.some((m) => m.id === s.id));
    expect(overlap).toEqual([]);
  });

  it('follows the goal even when it sits outside the role', () => {
    const salesWhoWantsInterviews = shortlist(
      CATALOGUE, intake({ role: 'sales', outcomes: ['close_more', 'interviews'] }), new Set(),
    );
    expect(categoriesIn(salesWhoWantsInterviews).has('interview')).toBe(true);
    expect(categoriesIn(salesWhoWantsInterviews).has('sales')).toBe(true);
  });

  it('never sends more than fits the prompt, and always has room to ramp', () => {
    for (const role of ['sales', 'account', 'support', 'manager', 'founder', 'job_seeker', 'student', 'other']) {
      const picked = shortlist(CATALOGUE, intake({ role }), new Set());
      expect(picked.length).toBeLessThanOrEqual(60);
      const tiers = new Set(picked.map((p) => p.difficulty_level));
      expect({ role, tiers: [...tiers].sort() }).toEqual({ role, tiers: ['advanced', 'beginner', 'intermediate'] });
    }
  });

  it('drops what they have mastered, so week two is not week one again', () => {
    const who = intake({ role: 'manager', outcomes: ['hard_talks'] });
    const week1 = shortlist(CATALOGUE, who, new Set());
    // They reached silver on everything the first week offered them.
    const mastered = new Set(week1.slice(0, 20).map((r) => r.id));
    const week2 = shortlist(CATALOGUE, who, mastered);
    expect(week2.some((r) => mastered.has(r.id))).toBe(false);
    expect(week2.length).toBeGreaterThan(0);
  });

  it('is stable: the same answers shortlist the same scenarios', () => {
    const a = shortlist(CATALOGUE, intake({ role: 'sales', struggles: ['price'] }), new Set());
    const b = shortlist(CATALOGUE, intake({ role: 'sales', struggles: ['price'] }), new Set());
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it('ranks the moment that goes wrong to the top of the list', () => {
    const priced = shortlist(CATALOGUE, intake({ role: 'sales', struggles: ['price'] }), new Set());
    const top = priced.slice(0, 12).flatMap((r) => r.tags ?? []);
    expect(top.some((t) => ['pricing', 'objection-handling', 'salary'].includes(t))).toBe(true);
  });

  it('mastery thresholds still mean what the shortlist assumes', () => {
    expect(MASTERY.bronze).toBeLessThan(MASTERY.silver);
  });
});
