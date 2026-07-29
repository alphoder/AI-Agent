/**
 * The client dossier shown on a scenario's Learn step.
 *
 * This is the intel a real agent would already have in front of them before
 * dialling: who this person is, how they live, what is going on around them.
 *
 * It is deliberately NOT coaching. No techniques, no "say this to open them up",
 * no objection-handling lines. The learner works out the approach themselves;
 * this only tells them who they are about to speak to. Anything tactical belongs
 * to the unit's Learn card, not here.
 */

export interface BriefFact {
  label: string;
  value: string;
}

export interface ClientBrief {
  /** "Suresh Nair, 38" — name and age as one line. */
  name: string;
  /** One line placing them: job, city. */
  headline: string;
  /** Quick-glance facts: family, home, income, vehicle, employer, etc. */
  facts: BriefFact[];
  /** 2-4 short paragraphs: their life, how they spend a day, what they value. */
  life: string[];
  /** What is going on right now that makes this call land the way it does. */
  situation: string;
  /** Money, time, family, work pressures that shape their answers. */
  pressures: string[];
  /** What they already have or believe about this product/topic. */
  standing: string[];
  /** How they come across on a call: pace, warmth, tells. */
  manner: string;
  /** What the file does NOT tell you: the honest gaps in the intel. */
  unknowns: string[];
}

/** A per-scenario check that the learner has actually read the file. */
export interface BriefQuizOption {
  id: string;
  text: string;
}

export interface BriefQuiz {
  question: string;
  options: BriefQuizOption[];
  correct: string;
  why: string;
  /** Why each wrong option is wrong, keyed by option id. */
  whyNot: Record<string, string>;
}

/** A short model exchange for the Watch step, for scenarios with no recording. */
export interface BriefExchange {
  speaker: 'agent' | 'client';
  line: string;
  /** What is happening underneath this line. */
  note?: string;
}

export interface ScenarioBrief {
  brief: ClientBrief;
  quiz: BriefQuiz;
  exchange: BriefExchange[];
}

/** Rough read time for the Learn step, so the stepper can stop guessing. */
export function briefMinutes(b: ClientBrief): number {
  const words =
    (b.life.join(' ') + b.situation + b.pressures.join(' ') + b.standing.join(' ') + b.manner)
      .split(/\s+/).length;
  return Math.max(2, Math.round(words / 180));
}
