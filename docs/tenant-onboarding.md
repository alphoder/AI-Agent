# Tenant Onboarding Guide

This guide walks through every step required to onboard a new tenant onto the AI Avatar Training Platform, from database record creation through SSO integration to go-live verification.

---

## 1. Overview of Multi-Tenant Architecture

The platform isolates tenant data using PostgreSQL Row-Level Security (RLS). Every table containing tenant-specific data includes a `tenant_id` column, and RLS policies ensure queries only return rows belonging to the current tenant context.

Key design points:

- **Tenant identification** -- each tenant has a unique UUID (`id`), a human-readable `name`, and a URL-safe `slug` (e.g. `acme`). The slug is used in SSO callback URLs and API routing.
- **SSO-first authentication** -- there are no local passwords. All users authenticate through their organization's Identity Provider (IdP) via SAML 2.0 or OIDC.
- **Role resolution** -- user roles (`admin` or `learner`) are derived from SSO group attributes at login time using configurable role mapping. The default role is always `learner`.
- **Avatar provider per tenant** -- each tenant is configured to use either Simli or HeyGen as their video avatar provider.
- **Session controls** -- concurrency limits, duration caps, and idle timeouts are configured per tenant.

---

## 2. New Tenant Setup Checklist

Use this checklist to track progress. Every item is detailed in the sections below.

- [ ] Collect tenant information (name, slug, contact)
- [ ] Create the tenant record in the database
- [ ] Configure SSO (SAML 2.0 or OIDC)
- [ ] Configure role mapping
- [ ] Select and configure avatar provider
- [ ] Set session limits and timeouts
- [ ] Set data retention policy
- [ ] Create the initial admin user (or verify SSO auto-provisioning)
- [ ] Run integration tests
- [ ] Complete go-live checklist

---

## 3. Database Tenant Creation

### Option A: SQL (direct database access)

```sql
INSERT INTO tenants (
  id,
  name,
  slug,
  sso_provider,
  sso_metadata_url,
  sso_client_id,
  sso_client_secret_encrypted,
  sso_config,
  avatar_provider,
  max_concurrent_sessions,
  session_duration_limit_sec,
  idle_timeout_sec,
  data_retention_days,
  is_active
)
VALUES (
  generate_uuidv7(),
  'Acme Corporation',          -- display name
  'acme',                      -- URL-safe slug, must be unique
  'oidc',                      -- 'saml' or 'oidc'
  NULL,                        -- filled in during SSO setup
  NULL,                        -- filled in during SSO setup
  NULL,                        -- filled in during SSO setup
  '{"role_mapping": {"source_field": "groups", "admin_values": ["platform-admins"]}}',
  'simli',                     -- 'simli' or 'heygen'
  10,                          -- max concurrent sessions
  900,                         -- 15-minute session cap
  300,                         -- 5-minute idle timeout
  365,                         -- retain data for 1 year
  false                        -- keep inactive until SSO is configured
)
RETURNING id;
```

Save the returned `id` -- it is needed for all subsequent steps.

### Option B: Admin API

```bash
curl -X POST https://api.yourdomain.com/admin/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "slug": "acme",
    "sso_provider": "oidc",
    "avatar_provider": "simli",
    "max_concurrent_sessions": 10,
    "session_duration_limit_sec": 900,
    "idle_timeout_sec": 300,
    "data_retention_days": 365
  }'
```

### Slug naming rules

- Lowercase alphanumeric and hyphens only.
- Must be unique across all tenants.
- Used in SSO callback URLs: `https://api.yourdomain.com/auth/{slug}/callback`
- Cannot be changed after users have been provisioned without breaking SSO redirects.

---

## 4. SSO Configuration

The platform supports two SSO protocols. Choose one based on what the tenant's IdP supports.

### 4a. SAML 2.0

1. **Provide the tenant with the platform's Service Provider (SP) metadata:**
   - Entity ID: `avatar-platform-{tenant_id}`
   - ACS URL: `https://api.yourdomain.com/auth/{slug}/callback`
   - Require signed assertions and signed responses (both enforced by the platform).

2. **Collect from the tenant's IdP:**
   - IdP SSO URL (entry point)
   - IdP signing certificate (X.509, PEM format)
   - The attribute name that carries group membership (commonly `groups`, `memberOf`, or a custom claim)

3. **Update the tenant record:**

```sql
UPDATE tenants SET
  sso_provider = 'saml',
  sso_metadata_url = 'https://idp.acme.com/saml/sso',
  sso_config = '{
    "role_mapping": {
      "source_field": "groups",
      "admin_values": ["platform-admins", "avatar-admins"]
    }
  }'
WHERE slug = 'acme';
```

4. Store the IdP certificate in your secrets store and configure the SAML adapter to reference it.

### 4b. OIDC (OpenID Connect)

1. **Provide the tenant with the platform's redirect URI:**
   - `https://api.yourdomain.com/auth/{slug}/callback`

2. **Collect from the tenant's IdP:**
   - Discovery URL (e.g. `https://login.acme.com/.well-known/openid-configuration`)
   - Client ID
   - Client Secret

3. **Update the tenant record:**

```sql
UPDATE tenants SET
  sso_provider = 'oidc',
  sso_metadata_url = 'https://login.acme.com/.well-known/openid-configuration',
  sso_client_id = 'avatar-platform-client-id',
  sso_client_secret_encrypted = pgp_sym_encrypt('the-client-secret', current_setting('app.encryption_key'))
WHERE slug = 'acme';
```

The platform uses Authorization Code Flow with PKCE. Requested scopes: `openid email profile`.

---

## 5. Role Mapping Configuration

Role mapping determines whether an SSO-authenticated user is granted the `admin` or `learner` role. Configuration lives in the `sso_config` JSONB column.

### Schema

```json
{
  "role_mapping": {
    "source_field": "groups",
    "admin_values": ["platform-admins"]
  }
}
```

| Field | Description |
|---|---|
| `source_field` | The SSO attribute to read group membership from. For SAML this is the assertion attribute name; for OIDC this is the claim name from the id_token or userinfo endpoint. Defaults to `"groups"` if not set. |
| `admin_values` | An array of group/role names that grant admin access. Matching is case-insensitive. Any user whose groups include at least one of these values gets `admin`; everyone else gets `learner`. |

### Security behavior

- If `role_mapping` is missing or `admin_values` is empty, **all users default to `learner`**. The system never defaults to admin.
- Groups can arrive as a JSON array or a comma-separated string -- both are handled.
- Role is re-evaluated on every login, so IdP group changes take effect immediately.

### Example: Okta with custom groups claim

```json
{
  "role_mapping": {
    "source_field": "custom:okta_groups",
    "admin_values": ["AvatarPlatform_Admins", "IT_SuperAdmins"]
  }
}
```

### Example: Azure AD with roles claim

```json
{
  "role_mapping": {
    "source_field": "roles",
    "admin_values": ["AvatarAdmin"]
  }
}
```

---

## 6. Avatar Provider Selection

Each tenant uses exactly one video avatar provider. Set the `avatar_provider` column.

| Provider | Value | Notes |
|---|---|---|
| Simli | `simli` | Real-time streaming avatar. Lower latency. |
| HeyGen | `heygen` | Pre-rendered avatar clips. Broader avatar library. |

```sql
UPDATE tenants SET avatar_provider = 'simli' WHERE slug = 'acme';
```

The choice affects which API keys must be configured in the platform's environment. Confirm the provider's API credentials are present in the deployment before activating the tenant.

---

## 7. Session Limits and Timeout Configuration

Three columns control session behavior per tenant:

| Column | Type | Default | Description |
|---|---|---|---|
| `max_concurrent_sessions` | integer | 10 | Maximum number of active avatar sessions across all users in the tenant at the same time. |
| `session_duration_limit_sec` | integer | 900 | Hard cap on a single session's duration in seconds (e.g. 900 = 15 min). Sessions are force-ended when this is reached. |
| `idle_timeout_sec` | integer | 300 | Seconds of user inactivity before a session is automatically terminated (e.g. 300 = 5 min). |

```sql
UPDATE tenants SET
  max_concurrent_sessions = 25,
  session_duration_limit_sec = 1200,   -- 20 minutes
  idle_timeout_sec = 180               -- 3 minutes
WHERE slug = 'acme';
```

Guidance for setting values:

- **Concurrent sessions**: estimate peak simultaneous learners, then add 20% headroom.
- **Duration limit**: match the longest scenario's `max_duration_sec`, plus a small buffer.
- **Idle timeout**: 3-5 minutes is typical; shorter values reduce idle avatar-provider costs.

---

## 8. Data Retention Policy

The `data_retention_days` column controls how long session recordings, transcripts, and AI-generated evaluations are retained before automated cleanup removes them.

```sql
UPDATE tenants SET data_retention_days = 730 WHERE slug = 'acme';  -- 2 years
```

| Retention Period | Typical Use Case |
|---|---|
| 90 days | Short training programs, cost-conscious tenants |
| 365 days | Standard enterprise compliance |
| 730 days | Regulated industries requiring long audit trails |

Confirm the retention period with the tenant's compliance team before setting this value. Once data is purged, it cannot be recovered.

---

## 9. Initial Admin User Setup

Admin users are normally auto-provisioned on first SSO login when their IdP groups match an `admin_values` entry. However, you may want to pre-create the first admin to allow them to configure scenarios before other users log in.

### Pre-create via SQL

```sql
-- Set the tenant context for RLS
SELECT set_config('app.current_tenant_id', '<tenant_id>', false);

INSERT INTO users (id, tenant_id, email, display_name, role, external_id)
VALUES (
  generate_uuidv7(),
  '<tenant_id>',
  'admin@acme.com',
  'Initial Admin',
  'admin',
  'pre-provisioned'
);
```

The `external_id` will be updated automatically when this user authenticates via SSO for the first time, linking the pre-created record to their IdP identity.

### Verify admin access

After SSO is configured, have the designated admin user log in and confirm they see the admin dashboard. If they land on the learner view instead, check:

1. The IdP is sending the expected group/role attribute.
2. The `source_field` in `sso_config.role_mapping` matches the attribute name from the IdP.
3. The user's group value appears in `admin_values` (matching is case-insensitive).

---

## 10. Testing the Integration

Run through each of these verifications before handing the tenant off.

### 10a. SSO login flow

1. Navigate to `https://app.yourdomain.com/login/{slug}`.
2. Confirm the browser redirects to the tenant's IdP.
3. Authenticate with a test account.
4. Confirm the callback redirects back to the platform and a session is created.
5. Verify the user record was created in the `users` table with the correct `tenant_id`, `email`, `display_name`, and `role`.

### 10b. Role mapping

1. Log in with a user whose IdP groups include an `admin_values` entry. Confirm role is `admin`.
2. Log in with a user whose IdP groups do NOT include any `admin_values` entry. Confirm role is `learner`.
3. If feasible, change a test user's group in the IdP, log in again, and confirm the role updates.

### 10c. Tenant isolation

1. While authenticated as a user in the new tenant, attempt to access resources belonging to another tenant (e.g. via direct API call with a foreign `tenant_id`).
2. Confirm a 403 or empty result is returned -- RLS must prevent cross-tenant data access.

### 10d. Session controls

1. Start a session and let it idle past `idle_timeout_sec`. Confirm it is terminated.
2. Start a session and let it run past `session_duration_limit_sec`. Confirm it is force-ended.
3. If practical, start sessions up to `max_concurrent_sessions` and attempt one more. Confirm it is rejected.

### 10e. Avatar provider

1. Create a test avatar using the configured provider.
2. Start a session and confirm the avatar renders and responds.

---

## 11. Go-Live Checklist

Complete every item before activating the tenant for production use.

- [ ] Tenant record exists with correct `slug`, `name`, and `sso_provider`
- [ ] SSO metadata URL / client credentials are set and encrypted
- [ ] SSO login flow verified end-to-end with the tenant's IdP
- [ ] Role mapping tested -- admin and learner roles resolve correctly
- [ ] Avatar provider confirmed working (`simli` or `heygen`)
- [ ] `max_concurrent_sessions` set to an appropriate value
- [ ] `session_duration_limit_sec` and `idle_timeout_sec` configured
- [ ] `data_retention_days` approved by tenant's compliance team
- [ ] Initial admin user can log in and access the admin dashboard
- [ ] Tenant isolation verified (RLS prevents cross-tenant access)
- [ ] At least one scenario created and assigned to a test learner
- [ ] End-to-end session test passed (login, start session, avatar interaction, evaluation)

When all items pass, activate the tenant:

```sql
UPDATE tenants SET is_active = true WHERE slug = 'acme';
```

The tenant's users can now log in at `https://app.yourdomain.com/login/acme`.
