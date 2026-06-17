import { ScenarioStatus, DifficultyLevel, Visibility } from '../enums';

/**
 * A Scenario is the single unit of a practice experience. Persona config
 * (character system prompt, voice, language) is folded directly into it —
 * there is no separate persona/avatar entity in the voice-only product.
 */
export interface Scenario {
  id: string;
  title: string;
  description: string | null;
  objective: string;
  /** Character/instructions the AI coach plays during the conversation. */
  system_prompt: string | null;
  /** First line the coach speaks to open the session. */
  opening_message: string | null;
  /** ISO 639-1 language the conversation runs in (e.g. 'en', 'es', 'hi'). */
  language: string;
  /** Gemini Live prebuilt voice name (e.g. 'Aoede', 'Puck', 'Charon'). */
  voice: string;
  scoring_rubric: RubricCriterion[];
  status: ScenarioStatus;
  visibility: Visibility;
  max_duration_sec: number;
  max_turns: number;
  difficulty_level: DifficultyLevel;
  tags: string[];
  /** Owner; null for seeded public library scenarios. */
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RubricCriterion {
  name: string;
  description: string;
  weight: number;
  levels: RubricLevel[];
}

export interface RubricLevel {
  score: number;
  label: string;
  description: string;
}
