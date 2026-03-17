export enum UserRole {
  ADMIN = 'admin',
  LEARNER = 'learner',
}

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

export enum AvatarStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PROCESSING = 'processing',
  FAILED = 'failed',
}

export enum EmbeddingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

export enum AvatarProvider {
  SIMLI = 'simli',
  HEYGEN = 'heygen',
}

export enum AssignmentStatus {
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum TranscriptRole {
  LEARNER = 'learner',
  AVATAR = 'avatar',
  SYSTEM = 'system',
}

export enum SSOProvider {
  SAML = 'saml',
  OIDC = 'oidc',
}

export enum FileType {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  MD = 'md',
}

export enum DifficultyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}
