import { SSOProvider, AvatarProvider } from '../enums';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  sso_provider: SSOProvider;
  sso_metadata_url: string | null;
  sso_client_id: string | null;
  sso_client_secret_encrypted: string | null;
  sso_config: SSOConfig | null;
  avatar_provider: AvatarProvider;
  max_concurrent_sessions: number;
  session_duration_limit_sec: number;
  idle_timeout_sec: number;
  data_retention_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SSOConfig {
  role_mapping: {
    source_field: string;
    admin_values: string[];
  };
}
