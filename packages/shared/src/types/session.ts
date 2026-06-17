import { SessionStatus, TranscriptRole } from '../enums';

export interface Session {
  id: string;
  user_id: string;
  scenario_id: string;
  language: string | null;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  total_turns: number | null;
  /** Ephemeral body-language observations (short text notes, no video). */
  body_language_notes: BodyLanguageNote[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BodyLanguageNote {
  /** Seconds into the session when the observation was made. */
  at: number;
  note: string;
}

export interface SessionTranscript {
  id: string;
  session_id: string;
  turn_number: number;
  role: TranscriptRole;
  content: string;
  stt_confidence: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface SessionScore {
  id: string;
  session_id: string;
  overall_score: number;
  criteria_scores: CriteriaScore[];
  strengths: string[];
  improvements: string[];
  narrative_feedback: string | null;
  /** Non-verbal score (0-100) derived from accumulated body-language notes. */
  body_language_score: number | null;
  body_language_feedback: string | null;
  scored_by_model: string;
  created_at: string;
}

export interface CriteriaScore {
  criterion_name: string;
  score: number;
  weight: number;
  justification: string;
}
