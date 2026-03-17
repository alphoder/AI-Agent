import { UserRole } from '../enums';

export interface User {
  id: string;
  tenant_id: string;
  external_id: string | null;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
