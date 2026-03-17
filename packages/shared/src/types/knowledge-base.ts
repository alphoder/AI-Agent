import { FileType, EmbeddingStatus } from '../enums';

export interface KnowledgeBaseDocument {
  id: string;
  tenant_id: string;
  persona_id: string;
  original_filename: string;
  s3_key: string;
  file_type: FileType;
  file_size_bytes: number;
  chunk_count: number | null;
  total_tokens: number | null;
  embedding_status: EmbeddingStatus;
  embedding_error: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
