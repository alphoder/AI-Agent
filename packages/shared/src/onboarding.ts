/**
 * First-run questionnaire definitions — shared so the web flow, recommendations,
 * and any analytics speak the same language. Goal tags map onto the exact tags
 * carried by the seeded scenario library (see apps/api/src/db/seed.ts).
 */

export interface OnboardingOption {
  id: string;
  label: string;
  blurb?: string;
}

/** "I'm a…" — who the user is. Tailors tone; stored for growth insight. */
export const PERSONAS: OnboardingOption[] = [
  { id: 'student', label: 'Student', blurb: 'Classes, presentations, exams' },
  { id: 'job_seeker', label: 'Job-seeker', blurb: 'Interviews and offers' },
  { id: 'professional', label: 'Professional', blurb: 'Work conversations' },
  { id: 'founder', label: 'Founder', blurb: 'Pitches and selling' },
  { id: 'non_native', label: 'English learner', blurb: 'Fluency and confidence' },
];

/** "I want to get better at…" — drives scenario recommendations. */
export interface GoalOption extends OnboardingOption {
  tags: string[];
}

export const GOALS: GoalOption[] = [
  { id: 'public_speaking', label: 'Public speaking', blurb: 'Talks, pitches, presentations', tags: ['public-speaking', 'pitch', 'confidence', 'q-and-a'] },
  { id: 'social_confidence', label: 'Social confidence', blurb: 'Small talk, networking, dating', tags: ['social', 'small-talk', 'networking', 'dating'] },
  { id: 'interviews', label: 'Interviews', blurb: 'Land the role', tags: ['interview', 'career', 'behavioural'] },
  { id: 'difficult_conversations', label: 'Hard conversations', blurb: 'Feedback and conflict', tags: ['feedback', 'conflict', 'communication', 'de-escalation', 'empathy'] },
  { id: 'sales_persuasion', label: 'Selling & persuasion', blurb: 'Win people over', tags: ['sales', 'persuasion', 'negotiation', 'cold-calling', 'objection-handling'] },
  { id: 'leadership', label: 'Leadership', blurb: 'Lead and delegate', tags: ['leadership', 'management', 'delegation', 'feedback'] },
  { id: 'english_fluency', label: 'English fluency', blurb: 'Speak clearly and freely', tags: ['clarity', 'confidence'] },
  { id: 'academic', label: 'Academic', blurb: 'Defend and teach', tags: ['academic', 'defense', 'education', 'clarity'] },
];

const GOAL_BY_ID: Record<string, GoalOption> = Object.fromEntries(GOALS.map((g) => [g.id, g]));

/** Flatten the tags for a set of chosen goal ids (deduped). */
export function tagsForGoals(goalIds: string[] | null | undefined): string[] {
  if (!goalIds?.length) return [];
  const set = new Set<string>();
  for (const id of goalIds) for (const t of GOAL_BY_ID[id]?.tags ?? []) set.add(t);
  return [...set];
}

export function goalLabel(id: string): string {
  return GOAL_BY_ID[id]?.label ?? id;
}

/** Shape persisted at users.metadata.onboarding (and returned by GET /auth/me). */
export interface OnboardingState {
  persona: string | null;
  goals: string[];
  completed: boolean;
  completed_at: string;
}
