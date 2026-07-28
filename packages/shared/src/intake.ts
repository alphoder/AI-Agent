/**
 * My Journey intake — the questionnaire that produces a personalised plan.
 *
 * Shared on purpose: the web flow renders these options and the API validates
 * against the SAME ids, so a new option can never pass the UI and fail the server
 * (or worse, pass both and reach the model as garbage).
 */

export interface IntakeOption {
  id: string;
  label: string;
  blurb?: string;
}

/** Step 1 — who you are. Drives tone and which scenario categories fit. */
export const INTAKE_ROLES: IntakeOption[] = [
  { id: 'sales', label: 'Sales / advisor', blurb: 'You sell or advise customers' },
  { id: 'account', label: 'Account manager', blurb: 'You grow existing clients' },
  { id: 'support', label: 'Customer support', blurb: 'You handle people when things go wrong' },
  { id: 'manager', label: 'Manager / lead', blurb: 'You run a team' },
  { id: 'founder', label: 'Founder', blurb: 'You pitch and sell your own thing' },
  { id: 'job_seeker', label: 'Job seeker', blurb: 'You are interviewing' },
  { id: 'student', label: 'Student', blurb: 'Classes, vivas, placements' },
  { id: 'other', label: 'Something else', blurb: 'You just want to speak better' },
];

/** Step 2 — the field you work in. Picks the persona flavour. */
export const INTAKE_INDUSTRIES: IntakeOption[] = [
  { id: 'insurance', label: 'Insurance / BFSI' },
  { id: 'saas', label: 'Software / SaaS' },
  { id: 'realestate', label: 'Real estate' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'education', label: 'Education' },
  { id: 'retail', label: 'Retail / e-commerce' },
  { id: 'services', label: 'Consulting / services' },
  { id: 'other', label: 'Other' },
];

export const INTAKE_EXPERIENCE: IntakeOption[] = [
  { id: 'new', label: 'Just starting', blurb: 'Under a year' },
  { id: 'some', label: '1 to 3 years' },
  { id: 'seasoned', label: '3 to 8 years' },
  { id: 'veteran', label: '8 years or more' },
];

/** Step 3 — why you are here. Multi-select, max 3. */
export const INTAKE_OUTCOMES: IntakeOption[] = [
  { id: 'close_more', label: 'Close more deals', blurb: 'Turn conversations into yes' },
  { id: 'objections', label: 'Handle objections', blurb: 'Stop losing the call at "no"' },
  { id: 'cold_calls', label: 'Open cold calls', blurb: 'Earn the first thirty seconds' },
  { id: 'interviews', label: 'Ace interviews', blurb: 'Answer without freezing' },
  { id: 'hard_talks', label: 'Hard conversations', blurb: 'Feedback, conflict, saying no' },
  { id: 'presence', label: 'Present with presence', blurb: 'Pitches, demos, stakeholders' },
  { id: 'angry', label: 'Calm angry people', blurb: 'De-escalate and keep the customer' },
  { id: 'fluency', label: 'Speak more fluently', blurb: 'Fewer fillers, clearer sentences' },
];

/** Step 4 — the moment that goes wrong. Multi-select, plus optional free text. */
export const INTAKE_STRUGGLES: IntakeOption[] = [
  { id: 'opening', label: 'The first ten seconds' },
  { id: 'blank', label: 'I go blank under pressure' },
  { id: 'rambling', label: 'I ramble' },
  { id: 'price', label: 'Talking about price' },
  { id: 'pushback', label: 'When they push back' },
  { id: 'listening', label: 'I talk more than I listen' },
  { id: 'closing', label: 'Asking for the decision' },
  { id: 'fillers', label: 'Um, actually, basically' },
];

/** Step 7 — how hard the AI customer should be. */
export const INTAKE_INTENSITY: IntakeOption[] = [
  { id: 'gentle', label: 'Warm me up', blurb: 'Start easy and build' },
  { id: 'balanced', label: 'Mix it up', blurb: 'Easy to hard as I go' },
  { id: 'hard', label: 'Throw me in', blurb: 'Difficult people from day one' },
];

/** Indian states and union territories, for the competition boards. */
export const INDIAN_STATES: string[] = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry', 'Outside India',
];

export const MINUTES_PER_DAY = [5, 10, 15, 20, 30, 45, 60] as const;
export const DAYS_PER_WEEK = [2, 3, 4, 5, 6, 7] as const;

/** What the user answered. Persisted at users.metadata.intake. */
export interface Intake {
  role: string;
  industry: string;
  experience: string;
  outcomes: string[];
  struggles: string[];
  struggleNote: string;
  minutesPerDay: number;
  daysPerWeek: number;
  org: string;
  city: string;
  state: string;
  intensity: string;
  completedAt?: string;
}

const ids = (opts: IntakeOption[]) => opts.map((o) => o.id);

export const INTAKE_IDS = {
  role: ids(INTAKE_ROLES),
  industry: ids(INTAKE_INDUSTRIES),
  experience: ids(INTAKE_EXPERIENCE),
  outcomes: ids(INTAKE_OUTCOMES),
  struggles: ids(INTAKE_STRUGGLES),
  intensity: ids(INTAKE_INTENSITY),
};

export const INTAKE_LIMITS = {
  outcomes: 3,
  struggles: 4,
  note: 280,
  org: 60,
  city: 60,
  planDays: 30,
  tasksPerDay: 3,
};

export function labelFor(opts: IntakeOption[], id: string): string {
  return opts.find((o) => o.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// The generated plan
// ---------------------------------------------------------------------------

export type PlanTaskType = 'module' | 'call' | 'drill' | 'review';

export interface PlanTask {
  type: PlanTaskType;
  scenarioId: string;
  why: string;
}

export interface PlanDay {
  day: number;
  focus: string;
  tasks: PlanTask[];
}

export interface JourneyPlan {
  headline: string;
  days: PlanDay[];
}

export const PLAN_TASK_TYPES: PlanTaskType[] = ['module', 'call', 'drill', 'review'];

/** Minutes a task is budgeted at. Used for the day's "about N min" label. */
export const TASK_MINUTES: Record<PlanTaskType, number> = {
  module: 6,
  call: 8,
  drill: 3,
  review: 5,
};
