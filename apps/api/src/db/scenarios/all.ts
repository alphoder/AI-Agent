/**
 * Every seeded scenario, in one list.
 *
 * Both the seed and the brief generator need the whole catalogue, and two copies of
 * this list would drift the moment a category file is added. Add new categories here.
 */
import type { SeedScenario } from './kit';
import { SALES_SCENARIOS } from './sales';
import { CLIENT_GROWTH_SCENARIOS } from './client-growth';
import { INTERVIEW_SCENARIOS } from './interview';
import { SUPPORT_SCENARIOS } from './support';
import { NEGOTIATION_SCENARIOS } from './negotiation';
import { LEADERSHIP_SCENARIOS } from './leadership';
import { SPEAKING_SCENARIOS } from './speaking';
import { CONFIDENCE_SCENARIOS } from './confidence';

export const ALL_SEED_SCENARIOS: SeedScenario[] = [
  ...SALES_SCENARIOS,
  ...CLIENT_GROWTH_SCENARIOS,
  ...INTERVIEW_SCENARIOS,
  ...SUPPORT_SCENARIOS,
  ...NEGOTIATION_SCENARIOS,
  ...LEADERSHIP_SCENARIOS,
  ...SPEAKING_SCENARIOS,
  ...CONFIDENCE_SCENARIOS,
];
