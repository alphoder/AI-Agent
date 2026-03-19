# LTI 1.3 Integration Guide

## AI Avatar Training Platform -- LMS Integration

This guide walks LMS administrators through registering the AI Avatar Training Platform as an LTI 1.3 tool in their Learning Management System (LMS). It covers platform registration, launch flow mechanics, Deep Linking for scenario selection, grade passback via Assignment and Grade Services (AGS), user role mapping, troubleshooting, and security considerations.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Platform Endpoints Reference](#3-platform-endpoints-reference)
4. [Step-by-Step LMS Registration](#4-step-by-step-lms-registration)
   - [Canvas](#41-instructure-canvas)
   - [Moodle](#42-moodle)
   - [Blackboard](#43-blackboard-learn-ultra)
5. [Platform Registration Fields](#5-platform-registration-fields)
6. [JWKS Endpoint Configuration](#6-jwks-endpoint-configuration)
7. [Launch Flow Explanation](#7-launch-flow-explanation)
8. [Deep Linking for Scenario Selection](#8-deep-linking-for-scenario-selection)
9. [Grade Passback Configuration](#9-grade-passback-configuration)
10. [User Role Mapping](#10-user-role-mapping)
11. [Troubleshooting](#11-troubleshooting)
12. [Security Considerations](#12-security-considerations)

---

## 1. Overview

The AI Avatar Training Platform supports LTI 1.3 (Learning Tools Interoperability), the current IMS Global standard for securely connecting external tools to an LMS. The integration provides:

- **Single Sign-On (SSO)**: Learners and instructors launch directly from the LMS without separate credentials. The platform provisions user accounts on first launch via Just-In-Time (JIT) provisioning.
- **Deep Linking**: Instructors can browse and select training scenarios from within the LMS and embed them as links in course modules, assignments, or content areas.
- **Grade Passback (AGS)**: When a learner completes a scenario, the platform sends the score back to the LMS gradebook using the Assignment and Grade Services specification.
- **Role Mapping**: LMS roles (Instructor, Student, Administrator) are automatically mapped to platform roles, controlling access to administrative features.

LTI 1.3 replaces the older OAuth 1.0-based LTI 1.1 with an OpenID Connect (OIDC) authentication flow and asymmetric key verification (RSA-256), providing stronger security guarantees.

---

## 2. Prerequisites

Before beginning registration, confirm the following:

| Requirement | Details |
|---|---|
| **LMS admin access** | You need the ability to register external tools (Developer Keys in Canvas, External Tool config in Moodle, REST API/LTI registration in Blackboard). |
| **Platform deployment** | The AI Avatar Training Platform API must be accessible over HTTPS at a stable URL (e.g., `https://api.yourplatform.com`). LTI 1.3 requires HTTPS; plain HTTP will not work. |
| **RSA key pair** | The platform must have `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` environment variables set with PEM-encoded RSA keys. These power the JWKS endpoint and JWT signing. |
| **Database configured** | The `lti_platforms` and `lti_nonces` tables must exist in the database. These are created by the platform's migration scripts. |
| **Redis running** | Redis is used for nonce and state storage during the OIDC launch flow (TTL: 10 minutes). |
| **Network access** | The LMS must be able to reach the platform's API endpoints. The platform must be able to reach the LMS's JWKS and token endpoints. Ensure firewalls and proxies allow this bidirectional traffic. |

---

## 3. Platform Endpoints Reference

All paths below are relative to your API base URL (e.g., `https://api.yourplatform.com`).

| Endpoint | Method | URL | Purpose |
|---|---|---|---|
| **JWKS** | GET | `/api/lti/jwks` | Publishes the platform's public key in JWK Set format. The LMS fetches this to verify JWTs signed by the platform (used in Deep Linking responses and AGS token requests). |
| **OIDC Login Initiation** | GET | `/api/lti/login` | Entry point for the OIDC third-party-initiated login. The LMS redirects users here to begin a launch. |
| **Launch / Redirect URI** | POST | `/api/lti/launch` | Receives the signed `id_token` via `form_post` after the LMS authenticates the user. This is the main callback endpoint. |
| **Deep Linking Response** | POST | `/api/lti/deeplinking` | Authenticated endpoint (requires platform JWT) where the frontend POSTs selected scenarios. Returns a signed JWT for the LMS to consume. |
| **Grade Passback** | POST | `/api/lti/grades/:sessionId` | Authenticated endpoint that sends a completed session's score to the LMS gradebook via AGS. |

---

## 4. Step-by-Step LMS Registration

### 4.1 Instructure Canvas

#### Step 1: Create a Developer Key

1. Log in to Canvas as a root admin.
2. Navigate to **Admin > Developer Keys**.
3. Click **+ Developer Key** and select **LTI Key**.
4. Fill in the configuration:

| Field | Value |
|---|---|
| Key Name | AI Avatar Training Platform |
| Redirect URIs | `https://api.yourplatform.com/api/lti/launch` |
| Title | AI Avatar Training Platform |
| Description | AI-powered avatar-based training scenarios |
| Target Link URI | `https://api.yourplatform.com/api/lti/launch` |
| OpenID Connect Initiation URL | `https://api.yourplatform.com/api/lti/login` |
| JWK Method | Public JWK URL |
| Public JWK URL | `https://api.yourplatform.com/api/lti/jwks` |

5. Under **LTI Advantage Services**, enable:
   - `Can create and view assignment data in the gradebook associated with the tool` (AGS - Score)
   - `Can view assignment data in the gradebook associated with the tool` (AGS - Read)
   - `Can return grades to the gradebook` (AGS - Score Publishing)

6. Under **Additional Settings**:
   - Set **Privacy Level** to `Public` (required for name and email claims).

7. Click **Save**. The key will be in `OFF` state.
8. Toggle the Developer Key to **ON**.
9. Note the numeric **Client ID** shown in the Details column (e.g., `10000000000042`).

#### Step 2: Install the Tool in a Course or Account

1. Navigate to the course or account **Settings > Apps > View App Configurations**.
2. Click **+ App**.
3. In **Configuration Type**, select **By Client ID**.
4. Paste the Client ID from Step 1.
5. Click **Submit** and then **Install**.

#### Step 3: Record Canvas Platform Details

After installation, you need these values to register Canvas in the AI Avatar Training Platform database:

| Field | Canvas Value |
|---|---|
| Issuer | `https://canvas.instructure.com` (or your Canvas instance URL for self-hosted) |
| Client ID | The numeric ID from the Developer Key |
| Deployment ID | Found in **Admin > Developer Keys > Show Key > Deployment ID** |
| Auth Endpoint | `https://<your-canvas-domain>/api/lti/authorize_redirect` |
| Token Endpoint | `https://<your-canvas-domain>/login/oauth2/token` |
| JWKS URL | `https://<your-canvas-domain>/api/lti/security/jwks` |

#### Step 4: Register in the Platform Database

Insert the platform record:

```sql
INSERT INTO lti_platforms (
    id, tenant_id, issuer, client_id, deployment_id,
    auth_endpoint, token_endpoint, jwks_endpoint
) VALUES (
    gen_random_uuid(),
    '<your-tenant-uuid>',
    'https://canvas.instructure.com',
    '10000000000042',
    '<deployment-id>',
    'https://yourcanvas.instructure.com/api/lti/authorize_redirect',
    'https://yourcanvas.instructure.com/login/oauth2/token',
    'https://yourcanvas.instructure.com/api/lti/security/jwks'
);
```

---

### 4.2 Moodle

#### Step 1: Register as an External Tool

1. Log in to Moodle as an administrator.
2. Navigate to **Site administration > Plugins > Activity modules > External tool > Manage tools**.
3. Click **configure a tool manually**.
4. Fill in the registration form:

| Field | Value |
|---|---|
| Tool name | AI Avatar Training Platform |
| Tool URL | `https://api.yourplatform.com/api/lti/launch` |
| LTI version | LTI 1.3 |
| Public key type | Keyset URL |
| Public keyset | `https://api.yourplatform.com/api/lti/jwks` |
| Initiate login URL | `https://api.yourplatform.com/api/lti/login` |
| Redirection URI(s) | `https://api.yourplatform.com/api/lti/launch` |
| Content Selection URL | `https://api.yourplatform.com/api/lti/launch` |

5. Under **Services**:
   - Set **IMS LTI Assignment and Grade Services** to `Use this service for grade sync and column management`.
   - Set **IMS LTI Names and Role Provisioning Services** to `Use this service to retrieve members' information as per privacy settings`.

6. Under **Privacy**:
   - Set **Share launcher's name with tool** to `Always`.
   - Set **Share launcher's email with tool** to `Always`.

7. Click **Save changes**.

8. After saving, Moodle displays the tool's registration details. Record:
   - **Platform ID (Issuer)**: Typically `https://your-moodle-domain`
   - **Client ID**: Auto-generated by Moodle
   - **Deployment ID**: Auto-generated by Moodle
   - **Public keyset URL**: `https://your-moodle-domain/mod/lti/certs.php`
   - **Access token URL**: `https://your-moodle-domain/mod/lti/token.php`
   - **Authentication request URL**: `https://your-moodle-domain/mod/lti/auth.php`

#### Step 2: Register in the Platform Database

```sql
INSERT INTO lti_platforms (
    id, tenant_id, issuer, client_id, deployment_id,
    auth_endpoint, token_endpoint, jwks_endpoint
) VALUES (
    gen_random_uuid(),
    '<your-tenant-uuid>',
    'https://your-moodle-domain',
    '<moodle-client-id>',
    '<moodle-deployment-id>',
    'https://your-moodle-domain/mod/lti/auth.php',
    'https://your-moodle-domain/mod/lti/token.php',
    'https://your-moodle-domain/mod/lti/certs.php'
);
```

---

### 4.3 Blackboard Learn Ultra

#### Step 1: Register as an LTI Tool Provider

1. Log in to Blackboard Learn as a System Administrator.
2. Navigate to **System Admin > Integrations > LTI Tool Providers**.
3. Click **Register LTI 1.3/Advantage Tool**.
4. Enter the **Client ID** if you have already registered the application through the Blackboard Developer Portal. Otherwise, fill in the following:

| Field | Value |
|---|---|
| Client ID | (From Blackboard Developer Portal) |
| Tool Provider URL | `https://api.yourplatform.com/api/lti/launch` |
| Tool Provider Login URL | `https://api.yourplatform.com/api/lti/login` |
| Tool Provider JWKS URL | `https://api.yourplatform.com/api/lti/jwks` |
| Custom Parameters | (leave empty unless needed) |

5. Under **Institution Policies**:
   - Set **User Fields to Send**: Name, Email Address.
   - Set **Allow grade service access**: Yes.
   - Set **Allow Membership Service Access**: Yes.

6. Click **Submit**.

#### Step 2: Collect Blackboard Platform Details

After registration, Blackboard provides:

| Field | Blackboard Value |
|---|---|
| Issuer | `https://blackboard.com` |
| Client ID | Displayed after registration |
| Deployment ID | Displayed after registration |
| Auth Endpoint | `https://developer.blackboard.com/api/v1/gateway/oidcauth` |
| Token Endpoint | `https://developer.blackboard.com/api/v1/gateway/oauth2/jwttoken` |
| JWKS URL | `https://developer.blackboard.com/api/v1/management/applications/<app-id>/jwks.json` |

Note: Blackboard endpoint URLs may vary based on your region and instance type. Consult your Blackboard administrator or Anthology documentation for exact URLs.

#### Step 3: Register in the Platform Database

```sql
INSERT INTO lti_platforms (
    id, tenant_id, issuer, client_id, deployment_id,
    auth_endpoint, token_endpoint, jwks_endpoint
) VALUES (
    gen_random_uuid(),
    '<your-tenant-uuid>',
    'https://blackboard.com',
    '<blackboard-client-id>',
    '<blackboard-deployment-id>',
    'https://developer.blackboard.com/api/v1/gateway/oidcauth',
    'https://developer.blackboard.com/api/v1/gateway/oauth2/jwttoken',
    'https://developer.blackboard.com/api/v1/management/applications/<app-id>/jwks.json'
);
```

---

## 5. Platform Registration Fields

When adding an LMS to the `lti_platforms` database table, you must provide the following fields:

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key. Generate with `gen_random_uuid()`. |
| `tenant_id` | UUID | Foreign key linking to your tenant. All users launched from this LMS will be associated with this tenant. |
| `issuer` | Text | The platform's issuer identifier. This is a URL that uniquely identifies the LMS. For hosted Canvas, this is `https://canvas.instructure.com`. For self-hosted instances, it is the root URL of the LMS. This value must exactly match the `iss` claim in the id_token. |
| `client_id` | Text | The OAuth 2.0 client identifier assigned to your tool by the LMS during registration. This is the `aud` (audience) claim in the id_token. |
| `deployment_id` | Text | Identifies a specific deployment of the tool within the LMS. A single client_id can have multiple deployment_ids (e.g., one per course or institution). |
| `auth_endpoint` | Text | The LMS's OIDC authorization endpoint. The platform redirects users here during login initiation. |
| `token_endpoint` | Text | The LMS's OAuth 2.0 token endpoint. The platform uses this for client_credentials grants when sending grades back via AGS. |
| `jwks_endpoint` | Text | URL where the LMS publishes its JSON Web Key Set. The platform fetches keys from here to verify the signature on the `id_token` received during launch. |

### Example Complete Record

```
issuer:        https://canvas.instructure.com
client_id:     10000000000042
deployment_id: 1234:abc456def789
auth_endpoint: https://myschool.instructure.com/api/lti/authorize_redirect
token_endpoint: https://myschool.instructure.com/login/oauth2/token
jwks_endpoint: https://myschool.instructure.com/api/lti/security/jwks
```

---

## 6. JWKS Endpoint Configuration

### What It Does

The JWKS (JSON Web Key Set) endpoint at `/api/lti/jwks` publishes the platform's RSA public key in standard JWK format. The LMS uses this key to verify:

- **Deep Linking Response JWTs** signed by the platform when instructors select scenarios.
- **Client Assertion JWTs** signed by the platform when requesting OAuth 2.0 access tokens for grade passback.

### Response Format

A GET request to `/api/lti/jwks` returns:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "n": "<modulus>",
      "e": "AQAB",
      "kid": "<sha256-thumbprint>",
      "alg": "RS256",
      "use": "sig"
    }
  ]
}
```

### Key Properties

- **Algorithm**: RS256 (RSA Signature with SHA-256).
- **Key ID (`kid`)**: Computed automatically as the SHA-256 JWK thumbprint. This allows key rotation without breaking existing LMS configurations as long as the endpoint URL stays the same.
- **Key Usage**: `sig` (signature verification only).

### Configuration Requirements

1. Set the `JWT_PUBLIC_KEY` environment variable to a PEM-encoded RSA public key (SPKI format).
2. Set the `JWT_PRIVATE_KEY` environment variable to the corresponding PEM-encoded RSA private key (PKCS#8 format).
3. The JWKS endpoint must be publicly accessible (no authentication required). The LMS will fetch it at any time to verify tokens.

### Generating a Key Pair

If you need to generate a new RSA key pair:

```bash
# Generate a 2048-bit RSA private key in PKCS#8 PEM format
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048

# Extract the public key in SPKI PEM format
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

Set the file contents as the `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` environment variables respectively. When setting multi-line PEM values in environment variables, replace newlines with `\n` or use your deployment platform's secret management.

---

## 7. Launch Flow Explanation

The LTI 1.3 launch follows a three-step OIDC flow. Understanding this sequence is helpful for debugging integration issues.

### Step 1: OIDC Login Initiation

```
LMS ──GET──> /api/lti/login?iss=...&client_id=...&login_hint=...&target_link_uri=...
```

The LMS sends the user's browser to the platform's login endpoint with these query parameters:

| Parameter | Description |
|---|---|
| `iss` | Issuer URL of the LMS |
| `client_id` | The tool's client ID |
| `login_hint` | Opaque value identifying the user within the LMS |
| `target_link_uri` | (Optional) The intended launch URL |
| `lti_message_hint` | (Optional) Opaque value the LMS may need back |

The platform:
1. Looks up the LMS in the `lti_platforms` table by `issuer` + `client_id`.
2. Generates a cryptographic `nonce` and `state`, stores both in Redis with a 10-minute TTL.
3. Redirects the browser to the LMS's `auth_endpoint` with an OIDC authorization request (`response_type=id_token`, `response_mode=form_post`, `scope=openid`, `prompt=none`).

### Step 2: LMS Authentication

```
Platform ──302──> LMS auth_endpoint (with nonce, state, redirect_uri)
LMS authenticates user, builds id_token
LMS ──form POST──> /api/lti/launch (with id_token, state)
```

The LMS:
1. Authenticates the user (the user is already logged into the LMS).
2. Builds a signed `id_token` JWT containing the user's identity, roles, course context, and LTI claims.
3. Posts the `id_token` and `state` to the platform's launch endpoint via an auto-submitting HTML form.

### Step 3: Launch Processing

The platform's `/api/lti/launch` handler:

1. **Validates state**: Retrieves and deletes the state from Redis. If missing or expired, rejects the launch.
2. **Decodes the id_token**: Extracts the `iss` claim without verification to look up the platform.
3. **Verifies the id_token signature**: Fetches the LMS's JWKS and verifies the JWT signature, issuer, and audience.
4. **Validates nonce**: Retrieves and deletes the nonce from Redis. Also records it in the database to prevent replay attacks even across Redis restarts.
5. **Extracts LTI claims**: Pulls roles, course context, custom parameters, message type, Deep Linking settings, and AGS endpoints from the token.
6. **Provisions the user**: Creates or updates the user via JIT provisioning, mapping LMS roles to platform roles.
7. **Issues platform tokens**: Generates an access token and refresh token for the platform's own API.
8. **Handles message type**:
   - **LtiDeepLinkingRequest**: Redirects to the frontend Deep Linking UI.
   - **LtiResourceLinkRequest** (default): Redirects to the frontend with tokens in the URL fragment and optionally a `scenario_id` extracted from custom parameters or the target link URI.

### Flow Diagram

```
User clicks link in LMS
         |
         v
LMS ----GET----> /api/lti/login (OIDC initiation)
         |
         | Platform generates nonce + state, stores in Redis
         |
         v
Platform --302--> LMS auth_endpoint (OIDC auth request)
         |
         | LMS authenticates user, signs id_token
         |
         v
LMS ----POST----> /api/lti/launch (id_token + state via form_post)
         |
         | Platform verifies signature, nonce, state
         | Provisions user, issues tokens
         |
         v
Platform --302--> Frontend /callback#access_token=...&lti=true
         |
         v
User lands in the training platform, authenticated
```

---

## 8. Deep Linking for Scenario Selection

Deep Linking allows instructors to browse available training scenarios from within the LMS and embed specific scenarios as links in their course content.

### How It Works

1. **Instructor initiates Deep Linking from the LMS**: The LMS sends a launch request with `message_type` set to `LtiDeepLinkingRequest`. The id_token includes a `deep_linking_settings` claim containing configuration and a return URL.

2. **Platform redirects to the Deep Linking UI**: The launch handler detects the message type and redirects to `<frontend>/lti/deeplinking?access_token=...&platform_id=...`.

3. **Instructor selects scenarios**: The frontend displays available scenarios for the tenant. The instructor selects one or more.

4. **Frontend submits selection**: The frontend POSTs the selected `scenario_ids` and `platform_id` to `/api/lti/deeplinking`.

5. **Platform builds and signs a response JWT**: The platform constructs `ltiResourceLink` content items (one per scenario) with:
   - `title`: The scenario name
   - `url`: The launch URL with `scenario_id` appended
   - `custom.scenario_id`: The scenario UUID

   The response JWT is signed with the platform's private key and includes the deployment ID and any opaque `data` value from the original deep linking settings.

6. **Frontend posts the JWT back to the LMS**: The frontend auto-submits the signed JWT to the `deep_link_return_url` provided in the original settings.

7. **LMS stores the links**: The LMS verifies the JWT against the platform's JWKS endpoint and creates resource links in the course.

### Requirements

- The user must have the `admin` role (mapped from LMS Instructor/Administrator roles) to use Deep Linking.
- Deep Linking sessions expire after 1 hour. If the instructor takes longer than that to select scenarios, they must re-initiate from the LMS.
- The LMS must include the Deep Linking settings claim in its launch token.

### Content Item Format

Each selected scenario becomes a content item:

```json
{
  "type": "ltiResourceLink",
  "title": "Difficult Customer De-escalation",
  "url": "https://api.yourplatform.com/api/lti/launch?scenario_id=abc-123",
  "custom": {
    "scenario_id": "abc-123"
  }
}
```

---

## 9. Grade Passback Configuration

Grade passback uses the LTI Assignment and Grade Services (AGS) specification to send scores from the platform back to the LMS gradebook.

### Prerequisites

1. **AGS must be enabled** in the LMS tool registration (see LMS-specific steps in Section 4).
2. The LMS must include the AGS endpoint claim in the launch id_token:
   ```
   https://purl.imsglobal.org/spec/lti-ags/claim/endpoint
   ```
   This claim contains a `lineitem` URL pointing to the gradebook column.
3. The platform's `token_endpoint` must be correctly configured in the `lti_platforms` table.

### How It Works

1. A learner completes a training scenario. The platform records an `overall_score` in the `session_scores` table.

2. An authenticated request is made to `POST /api/lti/grades/:sessionId`.

3. The platform:
   - Loads the session and verifies it is `completed`.
   - Looks up the LTI platform for the user's tenant.
   - Retrieves the cached AGS endpoint from Redis.
   - Obtains an OAuth 2.0 access token from the LMS using a `client_credentials` grant with a JWT bearer assertion.
   - Posts the score to the lineitem's `/scores` endpoint.

4. The score payload sent to the LMS:
   ```json
   {
     "userId": "<lti-user-sub>",
     "scoreOf": 100,
     "scoreGiven": 85,
     "activityProgress": "Completed",
     "gradingProgress": "FullyGraded",
     "timestamp": "2026-03-18T10:30:00.000Z"
   }
   ```

### Score Scale

- Scores are on a 0-100 scale (`scoreOf: 100`).
- The `overall_score` from the session is sent as `scoreGiven`.
- If no score has been computed yet, `scoreGiven` defaults to 0.

### Token Exchange Details

The platform authenticates to the LMS token endpoint using:
- **Grant type**: `client_credentials`
- **Client assertion type**: `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`
- **Client assertion**: A short-lived (5 minute) JWT signed with the platform's private key, with:
  - `iss` and `sub` set to the `client_id`
  - `aud` set to the LMS token endpoint URL
  - A unique `jti`
- **Scope**: `https://purl.imsglobal.org/spec/lti-ags/scope/score`

### Important Notes

- AGS endpoints are cached in Redis for 2 hours after a launch. If the cache expires, a new launch is required before grades can be sent.
- The platform retries a failed score post once before returning an error.
- Grade passback requires the session to be completed. Attempting to send grades for an in-progress session returns a `SESSION_INCOMPLETE` error.

---

## 10. User Role Mapping

The platform maps LMS roles to two internal roles: `admin` and `learner`.

### Mapping Rules

| LMS Role (IMS URI substring) | Platform Role |
|---|---|
| Contains `Instructor` | `admin` |
| Contains `Administrator` | `admin` |
| Contains `ContentDeveloper` | `admin` |
| All other roles (e.g., `Learner`, `Student`, `Member`) | `learner` |

### Common LMS Role URIs

The LTI specification defines roles as full URIs. The platform performs substring matching, so any role URI containing the keywords above will match.

**Canvas examples**:
- `http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor` -> `admin`
- `http://purl.imsglobal.org/vocab/lis/v2/membership#Learner` -> `learner`
- `http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator` -> `admin`

**Moodle examples**:
- `http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor` -> `admin`
- `http://purl.imsglobal.org/vocab/lis/v2/membership#Learner` -> `learner`
- `http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper` -> `admin`

### Permissions by Role

| Capability | `admin` | `learner` |
|---|---|---|
| Launch scenarios | Yes | Yes |
| View own sessions and scores | Yes | Yes |
| Access Deep Linking UI | Yes | No |
| Select scenarios for LMS embedding | Yes | No |
| Manage scenarios and platform settings | Yes | No |

### JIT User Provisioning

On every launch, the platform creates or updates the user record:
- **External ID**: `lti:<platform-id>:<sub>` -- uniquely identifies the user across the LTI platform.
- **Email**: Taken from the `email` claim. Falls back to `<sub>@lti.local` if no email is provided.
- **Display Name**: Taken from the `name` or `given_name` claim. Falls back to the email address.
- **Tenant**: All users from a given LMS platform are assigned to the same tenant (determined by the `tenant_id` in the platform registration).
- **Role**: Re-evaluated on every launch. If an LMS changes a user's role (e.g., from Student to Instructor), the platform role updates on the next launch.

---

## 11. Troubleshooting

### Error: "Platform not registered" (UNKNOWN_PLATFORM)

**Cause**: The `iss` and/or `client_id` in the LMS launch request do not match any row in the `lti_platforms` table.

**Resolution**:
1. Verify the issuer URL in your database exactly matches what the LMS sends. Pay attention to trailing slashes and protocol (http vs https).
2. Verify the client_id matches. Canvas uses numeric IDs; Moodle and Blackboard use different formats.
3. Check server logs for the exact `iss` and `client_id` values received.

### Error: "Invalid or expired state" (INVALID_STATE)

**Cause**: The state parameter from the OIDC flow has expired (>10 minutes) or was already consumed.

**Resolution**:
1. Check that Redis is running and accessible.
2. Ensure the user completes the launch within 10 minutes of clicking the link.
3. If behind a load balancer, verify all API instances connect to the same Redis.
4. Check for clock skew between servers.

### Error: "Invalid or expired nonce" (INVALID_NONCE)

**Cause**: Same root causes as invalid state. The nonce is also stored in Redis with a 10-minute TTL.

**Resolution**: Same as INVALID_STATE above. Also check that the LMS is not replaying old launch tokens.

### Error: "id_token verification failed" (INVALID_TOKEN)

**Cause**: The platform could not verify the LMS's JWT signature.

**Resolution**:
1. Verify the `jwks_endpoint` in your platform registration is correct and accessible from the API server.
2. Test the JWKS URL directly: `curl <jwks_endpoint>` -- it should return a valid JWK Set.
3. Check that the LMS's signing keys have not rotated. Some LMSs cache JWKS; the platform fetches them fresh via `createRemoteJWKSet`.
4. Verify network connectivity from the API server to the LMS's JWKS URL.

### Error: "id_token has expired" (TOKEN_EXPIRED)

**Cause**: The `id_token` issued by the LMS has passed its `exp` time.

**Resolution**:
1. Check for clock skew between the LMS and the platform server. Use NTP to synchronize.
2. If the user's browser is slow or the network has high latency, the token may expire in transit.

### Error: "Token issuer does not match platform" (ISSUER_MISMATCH)

**Cause**: The `iss` claim in the id_token does not match the `issuer` stored in the database for the looked-up platform.

**Resolution**:
1. This typically means the wrong platform record was matched during login initiation.
2. Verify there are no duplicate or conflicting entries in the `lti_platforms` table.

### Error: "No AGS endpoint available" (NO_AGS)

**Cause**: The platform tried to send grades but no AGS endpoint was cached in Redis.

**Resolution**:
1. The AGS endpoint is cached for 2 hours after a launch. If the cache has expired, the learner needs to re-launch from the LMS before grades can be sent.
2. Verify that AGS is enabled in the LMS tool configuration.
3. Check that the LMS includes the AGS claim in the id_token. Not all LMS configurations include it by default.

### Error: "Failed to post grade to LMS" (AGS_FAILED)

**Cause**: The platform could not POST the score to the LMS's lineitem endpoint.

**Resolution**:
1. Check the API server logs for the HTTP status code and response body from the LMS.
2. Common causes:
   - 401/403: The access token is expired or the scope is insufficient. Verify `token_endpoint` and that AGS scopes are enabled.
   - 404: The lineitem URL is invalid or the assignment has been deleted in the LMS.
   - 422: The score payload format is rejected. Check the LMS's AGS implementation.
3. Verify network connectivity from the API server to the LMS.

### Error: "No active deep linking session found" (NO_DL_SESSION)

**Cause**: The Deep Linking session has expired (1 hour TTL) or the user navigated to the Deep Linking endpoint without initiating from the LMS.

**Resolution**:
1. Instruct the instructor to initiate Deep Linking from within the LMS, not by navigating directly to the platform.
2. If the session expired, re-initiate from the LMS.

### General Debugging Tips

- **Enable debug logging**: Set `LOG_LEVEL=debug` in the API environment to see detailed LTI flow logs.
- **Check Redis**: Use `redis-cli KEYS "lti:*"` to see active LTI state entries.
- **Test the JWKS endpoint**: `curl https://api.yourplatform.com/api/lti/jwks` should return a valid JWK Set.
- **Inspect the id_token**: Use [jwt.io](https://jwt.io) to decode the id_token (paste the raw token) and inspect its claims. Verify `iss`, `aud`, `sub`, `nonce`, roles, and message type.
- **Check LMS logs**: Most LMSs have their own logs for LTI launches. Canvas shows errors in the admin console. Moodle logs are in **Site administration > Reports > Logs**.

---

## 12. Security Considerations

### Transport Security

- All LTI endpoints must be served over HTTPS. The OIDC flow transmits sensitive tokens via browser redirects and form posts.
- Configure HSTS headers to prevent protocol downgrade attacks.
- If behind a reverse proxy, ensure `X-Forwarded-Proto` and `X-Forwarded-Host` headers are correctly set. The platform uses these to construct the launch URL.

### Nonce and State Management

- **Nonces** are single-use: consumed immediately upon verification and recorded in both Redis and the database. This prevents replay attacks even if Redis is cleared.
- **State** parameters are single-use: consumed immediately upon the launch callback. This prevents CSRF attacks.
- Both nonce and state expire after 10 minutes, limiting the window for attacks.

### Token Verification

- The platform verifies `id_token` signatures using the LMS's JWKS endpoint (fetched remotely via `createRemoteJWKSet`). It does not rely on shared secrets.
- Token verification checks `iss` (issuer), `aud` (audience/client_id), `exp` (expiration), and `nonce`.
- The issuer claim is cross-checked against the stored platform record to prevent token substitution attacks.

### Key Management

- The platform's RSA private key is used exclusively for signing (Deep Linking response JWTs, client assertion JWTs for AGS). It must never be exposed.
- Use at least 2048-bit RSA keys. 4096-bit is recommended for long-term deployments.
- Rotate keys periodically. Since the `kid` is computed dynamically from the key thumbprint, rotating the key pair in environment variables automatically updates the JWKS endpoint. After rotation, allow time for LMS caches to refresh before revoking the old key.

### Platform Registration Validation

- Only explicitly registered platforms (matched by `issuer` + `client_id`) can initiate launches. Unregistered platforms are rejected at the login initiation step.
- Each platform is bound to a specific tenant, providing data isolation between organizations.

### Deep Linking Authorization

- The Deep Linking response endpoint (`/api/lti/deeplinking`) requires authentication (platform JWT) and the `admin` role.
- Deep Linking sessions are scoped to a specific user and platform, stored in Redis with a 1-hour TTL.
- The Deep Linking response JWT is signed with the platform's private key and has a 5-minute expiration.

### Grade Passback Security

- Grade passback uses the OAuth 2.0 `client_credentials` flow with JWT bearer assertions, not shared secrets.
- The client assertion JWT has a 5-minute expiration and includes a unique `jti` to prevent replay.
- Scores are only sent for completed sessions belonging to the authenticated user.

### Data Privacy

- User provisioning uses the `sub` claim (an opaque identifier) as the primary LTI identity. Email and name are used for display purposes.
- If the LMS does not provide an email, the platform generates a synthetic `<sub>@lti.local` address.
- All user data is scoped to the tenant associated with the LMS platform registration.
- Consider configuring your LMS privacy settings to send only the minimum necessary user information.

### Network Security

- The API server must be able to reach the LMS's JWKS and token endpoints. Restrict outbound traffic to only necessary destinations.
- The LMS must be able to reach the platform's JWKS endpoint. Consider IP allowlisting if the LMS supports it.
- Rate limiting on the login and launch endpoints helps prevent abuse. The platform's existing rate limiting middleware applies to LTI endpoints.

### Cookie and Session Notes

- The LTI 1.3 launch uses `form_post` response mode, which avoids the third-party cookie issues that affected LTI 1.1 launches in iframes.
- Platform tokens are passed to the frontend via URL fragments (not query parameters), preventing them from appearing in server logs or the HTTP `Referer` header.
- If embedding the platform in an LMS iframe, ensure the platform sets appropriate `Content-Security-Policy` and `X-Frame-Options` headers to allow framing from the LMS domain.
