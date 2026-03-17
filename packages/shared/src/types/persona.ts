export interface Persona {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  avatar_id: string;
  system_prompt: string;
  system_prompt_version: number;
  guardrails: GuardrailsConfig;
  rag_enabled: boolean;
  rag_top_k: number;
  rag_similarity_threshold: number;
  temperature: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GuardrailsConfig {
  allowed_topics: string[];
  blocked_topics: string[];
  escalation_triggers: string[];
  max_response_tokens: number;
  follow_up_question_frequency: number;
}
