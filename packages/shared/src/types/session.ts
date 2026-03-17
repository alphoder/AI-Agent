import { SessionStatus, TranscriptRole } from '../enums';

export interface Session {
  id: string;
  tenant_id: string;
  assignment_id: string;
  user_id: string;
  scenario_id: string;
  livekit_room_id: string | null;
  simli_session_id: string | null;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  total_turns: number | null;
  learner_token_count: number | null;
  avatar_token_count: number | null;
  avg_latency_ms: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionTranscript {
  id: string;
  session_id: string;
  turn_number: number;
  role: TranscriptRole;
  content: string;
  stt_confidence: number | null;
  tokens_used: number | null;
  rag_chunks_used: number | null;
  guardrail_triggered: boolean;
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
  scored_by_model: string;
  created_at: string;
}

export interface CriteriaScore {
  criterion_name: string;
  score: number;
  weight: number;
  justification: string;
}
