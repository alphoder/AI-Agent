/**
 * The scenario library is content, so the only thing worth testing is that the
 * content still obeys the contracts the rest of the app relies on: catalog
 * routing by tag, valid voices, unique titles, and rubric weights that sum to
 * 100 (the scorer renormalises, but a wrong total means a wrong intent).
 *
 * ponytail: one test file for all 240 scenarios, not one per category.
 */
import { CATEGORIES, categoryFor, trackFor, VOICE_IDS } from '@avatar-platform/shared';
import { SALES_SCENARIOS } from '../db/scenarios/sales';
import { CLIENT_GROWTH_SCENARIOS } from '../db/scenarios/client-growth';
import { INTERVIEW_SCENARIOS } from '../db/scenarios/interview';
import { SUPPORT_SCENARIOS } from '../db/scenarios/support';
import { NEGOTIATION_SCENARIOS } from '../db/scenarios/negotiation';
import { LEADERSHIP_SCENARIOS } from '../db/scenarios/leadership';
import { SPEAKING_SCENARIOS } from '../db/scenarios/speaking';
import { CONFIDENCE_SCENARIOS } from '../db/scenarios/confidence';

const LIBRARY = {
  sales: SALES_SCENARIOS,
  'client-growth': CLIENT_GROWTH_SCENARIOS,
  interview: INTERVIEW_SCENARIOS,
  support: SUPPORT_SCENARIOS,
  negotiation: NEGOTIATION_SCENARIOS,
  leadership: LEADERSHIP_SCENARIOS,
  speaking: SPEAKING_SCENARIOS,
  confidence: CONFIDENCE_SCENARIOS,
} as const;

const ALL = Object.values(LIBRARY).flat();

describe('scenario library', () => {
  it('has at least 30 scenarios per browse category, weighted 3:2:1 towards beginner', () => {
    for (const [key, scenarios] of Object.entries(LIBRARY)) {
      const total = scenarios.length;
      const by = (level: string) => scenarios.filter((s) => s.difficulty_level === level).length;
      // Half beginner, a third intermediate, the rest advanced — a first-timer's
      // first call must be one they can win, and there must still be a ceiling.
      const want = { b: Math.round(total / 2), i: Math.round(total / 3) };
      expect(total).toBeGreaterThanOrEqual(30);
      expect({ key, b: by('beginner'), i: by('intermediate'), a: by('advanced') })
        .toEqual({ key, b: want.b, i: want.i, a: total - want.b - want.i });
    }
  });

  it('routes every scenario to the category its file claims', () => {
    for (const [key, scenarios] of Object.entries(LIBRARY)) {
      const misrouted = scenarios.filter((s) => categoryFor(s.tags) !== key).map((s) => s.title);
      expect({ key, misrouted }).toEqual({ key, misrouted: [] });
    }
  });

  it('routes every scenario to a real track, and never leaves a track empty', () => {
    for (const [key, scenarios] of Object.entries(LIBRARY)) {
      const tracks = CATEGORIES.find((c) => c.key === key)!.tracks.map((t) => t.key);
      const used = new Set(scenarios.map((s) => trackFor(s.tags, key)));
      for (const t of used) expect(tracks).toContain(t);
      // Every declared track that matches on tags must actually have content.
      const empty = tracks.filter((t) => !used.has(t) && t !== 'more' && t !== 'personal');
      expect({ key, empty }).toEqual({ key, empty: [] });
    }
  });

  it('uses unique titles (the seed upserts on title)', () => {
    const seen = new Map<string, number>();
    for (const s of ALL) seen.set(s.title, (seen.get(s.title) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('uses only real Gemini voices and rubrics weighted to 100', () => {
    for (const s of ALL) {
      expect(VOICE_IDS).toContain(s.voice);
      expect(s.rubric.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    }
  });
});
