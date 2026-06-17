export enum SessionStatus {
  CREATED = 'created',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  TIMED_OUT = 'timed_out',
  ERROR = 'error',
}

export enum ScenarioStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum Visibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum TranscriptRole {
  LEARNER = 'learner',
  COACH = 'avatar',
  SYSTEM = 'system',
}

export enum DifficultyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}
