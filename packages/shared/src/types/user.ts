export interface User {
  id: string;
  google_sub: string | null;
  email: string;
  name: string | null;
  picture: string | null;
  is_active: boolean;
  last_login_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
