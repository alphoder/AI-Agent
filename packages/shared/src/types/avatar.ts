import { AvatarProvider, AvatarStatus } from '../enums';

export interface Avatar {
  id: string;
  tenant_id: string;
  name: string;
  provider: AvatarProvider;
  provider_avatar_id: string | null;
  source_image_url: string;
  thumbnail_url: string | null;
  config: Record<string, unknown> | null;
  status: AvatarStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
