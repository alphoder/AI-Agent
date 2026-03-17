export interface LTIPlatform {
  id: string;
  tenant_id: string;
  issuer: string;
  client_id: string;
  auth_endpoint: string;
  token_endpoint: string;
  jwks_endpoint: string;
  created_at: string;
  updated_at: string;
}
