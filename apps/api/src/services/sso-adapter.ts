import { SAML } from '@node-saml/passport-saml';
import { Issuer, Client, generators } from 'openid-client';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { redis } from '../config/redis';

interface SSOResult {
  email: string;
  externalId: string;
  displayName: string;
  groups: string[];
  rawAttributes: Record<string, unknown>;
}

interface TenantSSOConfig {
  id: string;
  sso_provider: 'saml' | 'oidc';
  sso_metadata_url: string | null;
  sso_client_id: string | null;
  sso_client_secret_encrypted: string | null;
  sso_config: {
    role_mapping?: {
      source_field: string;
      admin_values: string[];
    };
  };
}

// Cache SSO adapter instances per tenant
const samlCache = new Map<string, SAML>();
const oidcClientCache = new Map<string, Client>();

/**
 * Generic SSO adapter supporting both SAML 2.0 and OIDC.
 * Routes to the correct handler based on tenant's sso_provider setting.
 */
export class SSOAdapter {
  /**
   * Get the login URL to redirect the user to their IdP.
   */
  static async getLoginUrl(
    tenantSlug: string,
    callbackUrl: string,
  ): Promise<{ url: string; tenantId: string; provider: string }> {
    const tenant = await this.getTenantSSO(tenantSlug);

    if (tenant.sso_provider === 'saml') {
      const saml = await this.getSAMLInstance(tenant);
      const url = await saml.getAuthorizeUrlAsync(
        '' as any,
        callbackUrl,
        { additionalParams: {} },
      );
      return { url, tenantId: tenant.id, provider: 'saml' };
    }

    // OIDC with Authorization Code Flow + PKCE
    const client = await this.getOIDCClient(tenant);
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();
    const nonce = generators.nonce();

    const url = client.authorizationUrl({
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      redirect_uri: callbackUrl,
    });

    // Persist code_verifier and nonce in Redis keyed by state (10 min TTL)
    await redis.set(
      `oidc:state:${state}`,
      JSON.stringify({ codeVerifier, nonce }),
      'EX',
      600,
    );

    return { url, tenantId: tenant.id, provider: 'oidc' };
  }

  /**
   * Validate the SSO callback response and extract user information.
   */
  static async validateCallback(
    tenantSlug: string,
    body: Record<string, string>,
    callbackUrl: string,
  ): Promise<SSOResult> {
    const tenant = await this.getTenantSSO(tenantSlug);

    if (tenant.sso_provider === 'saml') {
      return this.validateSAMLResponse(tenant, body);
    }

    return this.validateOIDCCallback(tenant, body, callbackUrl);
  }

  /**
   * SAML: Validate response signatures, audience, timestamps.
   * Extract email from NameID and groups from attributes.
   */
  private static async validateSAMLResponse(
    tenant: TenantSSOConfig,
    body: Record<string, string>,
  ): Promise<SSOResult> {
    const saml = await this.getSAMLInstance(tenant);

    const result = await saml.validatePostResponseAsync(body);

    const profile = result.profile;
    if (!profile) {
      throw new Error('SAML response did not contain a valid profile');
    }

    logger.info(
      { tenantId: tenant.id, email: profile.nameID },
      'SAML assertion validated',
    );

    return {
      email: profile.nameID || (profile as any).email || '',
      externalId: profile.nameID || '',
      displayName:
        (profile as any).displayName ||
        (profile as any)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
        profile.nameID || '',
      groups: this.extractGroups(profile as unknown as Record<string, unknown>, tenant.sso_config),
      rawAttributes: profile as unknown as Record<string, unknown>,
    };
  }

  /**
   * OIDC: Exchange authorization code, validate id_token claims.
   */
  private static async validateOIDCCallback(
    tenant: TenantSSOConfig,
    params: Record<string, string>,
    callbackUrl: string,
  ): Promise<SSOResult> {
    const client = await this.getOIDCClient(tenant);
    const callbackParams = client.callbackParams({ method: 'POST', body: params } as any);

    const tokenSet = await client.callback(callbackUrl, callbackParams);

    const claims = tokenSet.claims();
    const userinfo = await client.userinfo(tokenSet.access_token!);

    logger.info(
      { tenantId: tenant.id, email: claims.email || userinfo.email },
      'OIDC token validated',
    );

    return {
      email: (claims.email || userinfo.email) as string,
      externalId: claims.sub,
      displayName: (userinfo.name || claims.name || claims.email) as string,
      groups: this.extractGroups({ ...claims, ...userinfo }, tenant.sso_config),
      rawAttributes: { claims, userinfo },
    };
  }

  /**
   * Extract groups from SSO attributes for role resolution.
   */
  private static extractGroups(
    profile: Record<string, unknown>,
    ssoConfig: TenantSSOConfig['sso_config'],
  ): string[] {
    const sourceField = ssoConfig?.role_mapping?.source_field || 'groups';
    const groups = profile[sourceField];

    if (Array.isArray(groups)) return groups.map(String);
    if (typeof groups === 'string') return groups.split(',').map((g) => g.trim());
    return [];
  }

  private static async getTenantSSO(slug: string): Promise<TenantSSOConfig> {
    const result = await db.query(
      `SELECT id, sso_provider, sso_metadata_url, sso_client_id,
              sso_client_secret_encrypted, sso_config
       FROM tenants WHERE slug = $1 AND is_active = true AND deleted_at IS NULL`,
      [slug],
    );

    if (result.rows.length === 0) {
      throw new Error(`Tenant not found: ${slug}`);
    }

    return result.rows[0] as TenantSSOConfig;
  }

  private static async getSAMLInstance(tenant: TenantSSOConfig): Promise<SAML> {
    const cached = samlCache.get(tenant.id);
    if (cached) return cached;

    const saml = new SAML({
      entryPoint: tenant.sso_metadata_url || undefined,
      issuer: `avatar-platform-${tenant.id}`,
      cert: '', // Would come from IdP metadata
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
    });

    samlCache.set(tenant.id, saml);
    return saml;
  }

  private static async getOIDCClient(tenant: TenantSSOConfig): Promise<Client> {
    const cached = oidcClientCache.get(tenant.id);
    if (cached) return cached;

    if (!tenant.sso_metadata_url) {
      throw new Error('OIDC metadata URL not configured for tenant');
    }

    const issuer = await Issuer.discover(tenant.sso_metadata_url);

    const client = new issuer.Client({
      client_id: tenant.sso_client_id || '',
      client_secret: tenant.sso_client_secret_encrypted || undefined,
      response_types: ['code'],
    });

    oidcClientCache.set(tenant.id, client);
    return client;
  }
}
