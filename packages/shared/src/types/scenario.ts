import { ScenarioStatus, DifficultyLevel, AssignmentStatus } from '../enums';

export interface Scenario {
  id: string;
  tenant_id: string;
  persona_id: string;
  title: string;
  description: string | null;
  objective: string;
  opening_context: string | null;
  opening_message: string | null;
  scoring_rubric: RubricCriterion[];
  status: ScenarioStatus;
  max_duration_sec: number;
  max_turns: number;
  difficulty_level: DifficultyLevel;
  tags: string[];
  created_by: string;
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

export interface ScenarioAssignment {
  id: string;
  tenant_id: string;
  scenario_id: string;
  user_id: string;
  due_date: string | null;
  assigned_by: string;
  status: AssignmentStatus;
  created_at: string;
  updated_at: string;
}
