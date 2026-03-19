# AI Avatar Training Platform -- API Reference

> Base URL: `https://<host>/api`
>
> AI Service Base URL: `https://<host>:8000` (internal)

---

## Table of Contents

- [Authentication](#authentication)
- [Common Response Format](#common-response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Pagination](#pagination)
- [Endpoints](#endpoints)
  - [Auth](#auth)
  - [Avatars](#avatars)
  - [Personas](#personas)
  - [Scenarios](#scenarios)
  - [Sessions](#sessions)
  - [Analytics](#analytics)
  - [LTI 1.3](#lti-13)
- [AI Service (Internal)](#ai-service-internal)
  - [Session Orchestration](#session-orchestration)
  - [Embedding Pipeline](#embedding-pipeline)
  - [Scoring Engine](#scoring-engine)

---

## Authentication

The API uses **JWT Bearer tokens** issued via SSO (SAML) or LTI 1.3 launch flows.

| Header | Value |
|---|---|
| `Authorization` | `Bearer <access_token>` |

- **Access tokens** are short-lived JWTs containing `sub` (user ID), `tid` (tenant ID), and `role`.
- **Refresh tokens** are stored in an `httpOnly` cookie named `refresh_token` (path `/api/auth`, `SameSite=Strict`).
- Endpoints marked **Admin** require the JWT `role` claim to equal `admin`.
- Endpoints marked **Authenticated** require any valid JWT.
- Endpoints marked **Public** require no token.

---

## Common Response Format

All JSON responses follow a consistent envelope:

### Success

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

The `meta` field is present only on paginated list endpoints. Single-resource responses omit it.

### Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

---

## Error Handling

| HTTP Status | Meaning |
|---|---|
| `400` | Validation error or bad request body |
| `401` | Missing or invalid JWT / refresh token |
| `403` | Insufficient role (e.g. learner accessing admin route) |
| `404` | Resource not found within the tenant scope |
| `409` | Conflict (e.g. deleting a resource with active sessions, avatar already linked) |
| `429` | Rate limit exceeded or concurrent session limit reached |
| `500` | Internal server error |
| `502` | Upstream service failure (AI service, LMS) |

---

## Rate Limiting

| Scope | Limit |
|---|---|
| Auth endpoints (`/api/auth/*`) | 10 requests/minute per IP |
| Session creation (`POST /api/sessions`) | 5 requests/minute per user |
| All other endpoints | Default server limit |

When a rate limit is exceeded the API returns `429 Too Many Requests`.

---

## Pagination

List endpoints accept these query parameters:

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `page` | integer | `1` | -- | 1-based page number |
| `limit` | integer | `20` | `50` | Items per page |

---

## Endpoints

### Auth

All auth routes are prefixed with `/api/auth`.

#### SSO Login Initiation

```
GET /api/auth/sso/init?tenant=<slug>
```

| Attribute | Value |
|---|---|
| Auth | Public |
| Rate limit | 10/min |

Redirects the browser to the tenant's identity provider.

**Query Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `tenant` | string | Yes | Tenant slug |

**Responses**

| Status | Description |
|---|---|
| `302` | Redirect to IdP login URL |
| `400` | `MISSING_TENANT` -- tenant slug not provided |

---

#### SSO Callback

```
POST /api/auth/sso/callback
```

| Attribute | Value |
|---|---|
| Auth | Public |
| Rate limit | 10/min |

Receives the SAML assertion from the IdP, validates it, upserts the user, issues tokens, and redirects the browser to the frontend with the access token in a URL fragment.

**Body / Query Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `tenant` (query) | string | Conditional | Tenant slug (falls back to `RelayState` in body) |
| SAML fields | -- | Yes | Standard SAML POST binding fields |

**Responses**

| Status | Description |
|---|---|
| `302` | Redirect to `<frontend>/callback#access_token=<jwt>` |
| `400` | `MISSING_TENANT` |

**Side effects**: Sets an `httpOnly` `refresh_token` cookie (7-day expiry).

---

#### Refresh Token

```
POST /api/auth/refresh
```

| Attribute | Value |
|---|---|
| Auth | Cookie (`refresh_token`) |
| Rate limit | 10/min |

Rotates the refresh token and returns a new access token.

**Request**: No body required. The `refresh_token` cookie is read automatically.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "accessToken": "<jwt>"
  }
}
```

**Error Responses**

| Status | Code | Description |
|---|---|---|
| `401` | `NO_REFRESH_TOKEN` | Cookie not present |
| `401` | `INVALID_REFRESH_TOKEN` | Token invalid or expired |

---

#### Logout

```
POST /api/auth/logout
```

| Attribute | Value |
|---|---|
| Auth | Cookie (optional) |
| Rate limit | 10/min |

Revokes the current refresh token and clears the cookie.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": { "message": "Logged out" }
}
```

---

#### Get Current User

```
GET /api/auth/me
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Returns the profile of the currently authenticated user.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenant_id": "uuid",
    "email": "user@example.com",
    "display_name": "Jane Doe",
    "role": "admin",
    "is_active": true,
    "last_login_at": "2025-01-15T10:30:00Z",
    "metadata": {}
  }
}
```

| Status | Code |
|---|---|
| `401` | `UNAUTHORIZED` |
| `404` | `USER_NOT_FOUND` |

---

### Avatars

All avatar routes are prefixed with `/api/avatars`. Every request requires a valid JWT and tenant context.

#### Create Avatar

```
POST /api/avatars
```

| Attribute | Value |
|---|---|
| Auth | Admin |
| Content-Type | `multipart/form-data` |

Uploads a source image and begins async avatar generation via the AI service.

**Form Fields**

| Name | Type | Required | Description |
|---|---|---|---|
| `image` | file | Yes | JPEG or PNG image (max 5 MB). Validated via magic bytes. |
| `name` | string | Yes | Display name for the avatar |
| `config` | JSON string | No | Provider-specific configuration |

**Success Response** (`202 Accepted`)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "processing"
  }
}
```

**Error Responses**

| Status | Code |
|---|---|
| `400` | `MISSING_FILE`, `INVALID_FILE_TYPE`, `INVALID_FILE`, `MISSING_NAME` |

---

#### List Avatars

```
GET /api/avatars
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

**Query Parameters**

| Name | Type | Description |
|---|---|---|
| `page` | integer | Page number |
| `limit` | integer | Items per page |
| `status` | string | Filter by status (e.g. `processing`, `ready`, `failed`) |

**Success Response** (`200`) -- paginated list of avatar objects.

Each avatar object includes: `id`, `name`, `provider`, `provider_avatar_id`, `source_image_url`, `thumbnail_url`, `status`, `config`, `created_at`, `updated_at`.

---

#### Get Avatar

```
GET /api/avatars/:id
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

**Path Parameters**

| Name | Description |
|---|---|
| `id` | Avatar UUID |

**Success Response** (`200`) -- single avatar object (includes `created_by`).

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

#### Update Avatar

```
PATCH /api/avatars/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

**Request Body** (JSON)

| Name | Type | Description |
|---|---|---|
| `name` | string | New display name |
| `config` | object | Updated provider configuration |

At least one field is required.

**Success Response** (`200`) -- updated avatar object.

| Status | Code |
|---|---|
| `400` | `NO_UPDATES` |
| `404` | `NOT_FOUND` |

---

#### Delete Avatar

```
DELETE /api/avatars/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Performs a soft delete. Blocked if the avatar is linked to personas that have active sessions.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": { "id": "uuid", "deleted": true }
}
```

| Status | Code | Description |
|---|---|---|
| `404` | `NOT_FOUND` | Avatar not found |
| `409` | `ACTIVE_SESSIONS` | Cannot delete while sessions are active |

---

#### Regenerate Avatar

```
POST /api/avatars/:id/regenerate
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Resets the avatar to `processing` and re-triggers the AI service with the original source image.

**Success Response** (`202 Accepted`)

```json
{
  "success": true,
  "data": { "id": "uuid", "status": "processing" }
}
```

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

### Personas

All persona routes are prefixed with `/api/personas`. Every request requires a valid JWT and tenant context.

#### Create Persona

```
POST /api/personas
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Creates a persona linked 1:1 to an avatar. The avatar must not already be linked to another persona.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Persona display name |
| `description` | string | No | Description |
| `avatar_id` | UUID | Yes | ID of an existing avatar |
| `system_prompt` | string | Yes | LLM system prompt |
| `guardrails` | object | No | Guardrail configuration |
| `rag_enabled` | boolean | No | Enable RAG retrieval (default `false`) |
| `temperature` | number | No | LLM temperature 0-2 (default `0.7`) |

**Success Response** (`201 Created`) -- full persona object.

| Status | Code | Description |
|---|---|---|
| `400` | `MISSING_NAME`, `MISSING_AVATAR`, `MISSING_SYSTEM_PROMPT` | Validation errors |
| `404` | `AVATAR_NOT_FOUND` | Avatar does not exist |
| `409` | `AVATAR_ALREADY_LINKED` | Avatar is already used by another persona |

---

#### List Personas

```
GET /api/personas
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Returns a paginated list of personas with joined avatar metadata (`avatar_name`, `avatar_provider`, `avatar_status`, `avatar_thumbnail_url`).

**Query Parameters**: `page`, `limit`.

---

#### Get Persona

```
GET /api/personas/:id
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Returns a single persona with full avatar details.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

#### Update Persona

```
PATCH /api/personas/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

**Request Body** (JSON) -- all fields optional, at least one required:

| Name | Type | Description |
|---|---|---|
| `name` | string | Display name |
| `description` | string | Description |
| `system_prompt` | string | LLM system prompt |
| `guardrails` | object | Guardrail configuration |
| `rag_enabled` | boolean | Toggle RAG |
| `temperature` | number | 0-2 |

| Status | Code |
|---|---|
| `400` | `NO_UPDATES`, `INVALID_TEMPERATURE` |
| `404` | `NOT_FOUND` |

---

#### Delete Persona

```
DELETE /api/personas/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Soft delete. Blocked if linked scenarios have active sessions.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `ACTIVE_SESSIONS` |

---

#### Upload Document (RAG)

```
POST /api/personas/:id/documents
```

| Attribute | Value |
|---|---|
| Auth | Admin |
| Content-Type | `multipart/form-data` |

Uploads a knowledge base document for RAG. Stored in S3, then asynchronously chunked and embedded via the AI service.

**Form Fields**

| Name | Type | Required | Description |
|---|---|---|---|
| `file` | file | Yes | PDF, DOCX, TXT, or MD (max 50 MB). Magic-byte validated for PDF/DOCX. |

**Success Response** (`202 Accepted`)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "persona_id": "uuid",
    "original_filename": "handbook.pdf",
    "file_type": "pdf",
    "file_size_bytes": 2048576,
    "embedding_status": "pending"
  }
}
```

| Status | Code |
|---|---|
| `400` | `MISSING_FILE`, `INVALID_FILE_TYPE`, `INVALID_FILE` |
| `404` | `NOT_FOUND` (persona) |

---

#### List Documents

```
GET /api/personas/:id/documents
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Paginated list of documents with embedding status.

Each document object includes: `id`, `persona_id`, `original_filename`, `file_type`, `file_size_bytes`, `chunk_count`, `total_tokens`, `embedding_status`, `embedding_error`, `processing_started_at`, `processing_completed_at`, `created_by`, `created_at`, `updated_at`.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` (persona) |

---

#### Delete Document

```
DELETE /api/personas/:id/documents/:docId
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Deletes the document from the database, S3, and triggers vector deletion in the AI service.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

#### Reprocess Document

```
POST /api/personas/:id/documents/:docId/reprocess
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Re-triggers embedding for a document that previously failed or needs updating. Blocked if the document is currently processing.

**Success Response** (`202 Accepted`)

```json
{
  "success": true,
  "data": { "id": "uuid", "embedding_status": "pending" }
}
```

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `ALREADY_PROCESSING` |

---

### Scenarios

All scenario routes are prefixed with `/api/scenarios`. Every request requires a valid JWT and tenant context.

#### Create Scenario

```
POST /api/scenarios
```

| Attribute | Value |
|---|---|
| Auth | Admin |

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `persona_id` | UUID | Yes | Linked persona |
| `title` | string | Yes | Scenario title |
| `description` | string | No | Description |
| `objective` | string | Yes | Learning objective |
| `opening_context` | string | No | Context shown to the learner before the session |
| `opening_message` | string | No | First message from the avatar |
| `scoring_rubric` | array | Yes | Array of rubric criteria (see below) |
| `max_duration_sec` | integer | No | Max session duration in seconds (default `600`) |
| `max_turns` | integer | No | Max conversation turns (default `50`) |
| `difficulty_level` | string | No | `beginner`, `intermediate` (default), or `advanced` |
| `tags` | string[] | No | Categorization tags |

**Scoring Rubric Format**

Each criterion in the `scoring_rubric` array:

```json
{
  "name": "Communication Clarity",
  "description": "How clearly the learner communicates",
  "weight": 30,
  "levels": [
    { "score": 1, "label": "Poor", "description": "..." },
    { "score": 3, "label": "Adequate", "description": "..." },
    { "score": 5, "label": "Excellent", "description": "..." }
  ]
}
```

Constraints:
- Max 10 criteria
- Weights must sum to 100
- Level scores must be integers 1-5, unique per criterion

**Success Response** (`201 Created`) -- full scenario object with `status: "draft"`.

| Status | Code |
|---|---|
| `400` | `MISSING_TITLE`, `MISSING_PERSONA`, `MISSING_OBJECTIVE`, `INVALID_RUBRIC`, `INVALID_DIFFICULTY` |
| `404` | `PERSONA_NOT_FOUND` |

---

#### List Scenarios

```
GET /api/scenarios
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Paginated list with aggregated stats.

**Query Parameters**

| Name | Type | Description |
|---|---|---|
| `page` | integer | Page number |
| `limit` | integer | Items per page |
| `status` | string | Filter: `draft`, `active`, `archived` |
| `difficulty` | string | Filter: `beginner`, `intermediate`, `advanced` |

Each scenario object includes `persona_name`, `persona_thumbnail_url`, `assignment_count`, `completed_count`, and `avg_score`.

---

#### Get My Assignments (Learner)

```
GET /api/scenarios/assignments/me
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Returns the current user's scenario assignments with scenario, persona, and avatar metadata. Ordered by due date (ascending, nulls last).

---

#### Get Scenario

```
GET /api/scenarios/:id
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Full scenario details including persona and avatar information.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

#### Update Scenario

```
PATCH /api/scenarios/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Updates scenario fields. Blocked if the scenario has active sessions.

**Request Body** (JSON) -- all fields optional, at least one required. Supports the same fields as creation plus `status`.

**Status Transitions**

| From | Allowed To |
|---|---|
| `draft` | `active` |
| `active` | `archived` |
| `archived` | `draft` |

| Status | Code |
|---|---|
| `400` | `INVALID_TITLE`, `INVALID_OBJECTIVE`, `INVALID_RUBRIC`, `INVALID_STATUS_TRANSITION`, `INVALID_DURATION`, `INVALID_TURNS`, `INVALID_DIFFICULTY`, `NO_UPDATES` |
| `404` | `NOT_FOUND`, `PERSONA_NOT_FOUND` |
| `409` | `ACTIVE_SESSIONS` |

---

#### Delete Scenario

```
DELETE /api/scenarios/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Soft delete. Blocked if active sessions exist.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `ACTIVE_SESSIONS` |

---

#### Assign Learners

```
POST /api/scenarios/:id/assign
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Bulk assign learners to a scenario. Uses `ON CONFLICT` for idempotent behavior.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `user_ids` | UUID[] | Yes | Array of learner user IDs |
| `due_date` | ISO 8601 | No | Optional due date |

**Success Response** (`201 Created`)

```json
{
  "success": true,
  "data": [ { "id": "uuid", "scenario_id": "uuid", "user_id": "uuid", "status": "assigned", "due_date": null, "assigned_by": "uuid", "created_at": "..." } ],
  "meta": { "assigned": 5, "requested": 5 }
}
```

| Status | Code |
|---|---|
| `400` | `MISSING_USERS`, `INVALID_USERS` |
| `404` | `NOT_FOUND` |

---

#### Unassign Learner

```
DELETE /api/scenarios/:id/assign/:userId
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Removes a learner's assignment. Blocked if the learner has active sessions for this scenario.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `ACTIVE_SESSIONS` |

---

#### Duplicate Scenario

```
POST /api/scenarios/:id/duplicate
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Creates a deep copy of the scenario with `status: "draft"` and title suffixed with `(Copy)`. Does not copy assignments.

**Success Response** (`201 Created`) -- the new scenario object.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

### Sessions

All session routes are prefixed with `/api/sessions`. Every request requires a valid JWT and tenant context.

#### Create Session

```
POST /api/sessions
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |
| Rate limit | 5/min |

Starts a new real-time training session. Creates a LiveKit room, generates a participant token, and notifies the AI service to spawn the avatar bot.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `assignment_id` | UUID | Yes | The learner's scenario assignment ID |

**Validations**
- Assignment must belong to the requesting user.
- Linked scenario must have `status: "active"`.
- Tenant concurrent session limit must not be exceeded.

**Success Response** (`201 Created`)

```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "livekitToken": "<jwt>",
    "livekitUrl": "wss://livekit.example.com",
    "sessionConfig": {
      "maxDurationSec": 3600,
      "idleTimeoutSec": 300,
      "scenarioTitle": "Sales Negotiation",
      "personaName": "Client A",
      "maxTurns": 50
    }
  }
}
```

| Status | Code | Description |
|---|---|---|
| `400` | `MISSING_ASSIGNMENT`, `SCENARIO_INACTIVE` | Validation errors |
| `404` | `NOT_FOUND` | Assignment not found or not owned by user |
| `429` | `SESSION_LIMIT` | Tenant concurrent session limit reached |

---

#### End Session

```
POST /api/sessions/:id/end
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Ends the session, computes duration, cleans up the LiveKit room, decrements the active session counter, and triggers scoring via the AI service.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": { "sessionId": "uuid", "status": "completed" }
}
```

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` (or already ended) |

---

#### Get Session

```
GET /api/sessions/:id
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Returns session details including `scenario_title`, `objective`, and `persona_name`.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

#### Get Session Transcript

```
GET /api/sessions/:id/transcript
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Returns the ordered conversation transcript.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "turn_number": 1,
      "role": "assistant",
      "content": "Hello, how can I help you today?",
      "audio_url": "https://...",
      "duration_ms": 2500,
      "sentiment": "neutral",
      "created_at": "2025-01-15T10:31:00Z"
    }
  ]
}
```

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

#### Get Session Report

```
GET /api/sessions/:id/report
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Returns the scoring report for a completed session.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "session_id": "uuid",
    "overall_score": 78.5,
    "criteria_scores": [
      {
        "criterion_name": "Communication Clarity",
        "score": 4,
        "weight": 30,
        "justification": "..."
      }
    ],
    "strengths": ["Clear articulation", "Good empathy"],
    "improvements": ["Could ask more open-ended questions"],
    "narrative_feedback": "Overall the learner demonstrated...",
    "scored_by_model": "gpt-4o",
    "scored_at": "2025-01-15T10:45:00Z",
    "duration_sec": 320,
    "total_turns": 12,
    "started_at": "...",
    "ended_at": "...",
    "scenario_title": "Sales Negotiation",
    "scoring_rubric": [...]
  }
}
```

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` (report not yet generated) |

---

#### Save Session Score

```
POST /api/sessions/:id/score
```

| Attribute | Value |
|---|---|
| Auth | Authenticated (typically called by the AI service) |

Upserts a score record for a session.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `overall_score` | number | Yes | 0-100 weighted score |
| `criteria_scores` | array | Yes | Per-criterion scores |
| `strengths` | string[] | No | List of strengths |
| `improvements` | string[] | No | List of improvement areas |
| `narrative_feedback` | string | No | Free-form feedback narrative |
| `scored_by_model` | string | Yes | Model used for scoring (e.g. `gpt-4o`) |

**Success Response** (`201 Created`)

```json
{
  "success": true,
  "data": { "id": "uuid", "session_id": "uuid" }
}
```

| Status | Code |
|---|---|
| `400` | `INVALID_BODY` |
| `404` | `NOT_FOUND` |

---

#### Download PDF Report

```
GET /api/sessions/:id/report/pdf
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Generates (or returns a cached) PDF report and provides a signed S3 download URL.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "url": "https://s3.amazonaws.com/...signed-url..."
  }
}
```

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` (report not yet generated) |

---

### Analytics

All analytics routes are prefixed with `/api/analytics`. Every request requires **Admin** role.

#### Dashboard Overview

```
GET /api/analytics/overview
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Returns an admin dashboard overview for the tenant.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "totals": {
      "total_sessions": 500,
      "completed_sessions": 420,
      "total_learners": 85,
      "active_scenarios": 12
    },
    "trends": [
      { "date": "2025-01-01", "count": 15 }
    ],
    "completion_rate": 84.0,
    "score_distribution": [
      { "range": "0-20", "count": 5 },
      { "range": "20-40", "count": 18 },
      { "range": "40-60", "count": 45 },
      { "range": "60-80", "count": 120 },
      { "range": "80-100", "count": 80 }
    ],
    "recent_sessions": [
      {
        "id": "uuid",
        "status": "completed",
        "duration_sec": 340,
        "created_at": "...",
        "learner_name": "Jane Doe",
        "scenario_title": "Sales Negotiation",
        "overall_score": 82.5
      }
    ]
  }
}
```

`trends` contains session counts per day for the last 30 days. `recent_sessions` returns the 10 most recent sessions.

---

#### Scenario Analytics

```
GET /api/analytics/scenarios/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Returns analytics for a specific scenario.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "completion": {
      "total_assignments": 50,
      "completed_count": 35,
      "completion_rate": 70.0
    },
    "avg_score": 72.5,
    "top_performers": [
      {
        "display_name": "Jane Doe",
        "email": "jane@example.com",
        "overall_score": 95.0,
        "completed_at": "..."
      }
    ],
    "weakest_criteria": [
      { "criterion_name": "Active Listening", "avg_score": 2.8 },
      { "criterion_name": "Objection Handling", "avg_score": 3.1 }
    ]
  }
}
```

`top_performers` shows the top 5 by score. `weakest_criteria` is sorted ascending by average score.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

#### Learner Analytics

```
GET /api/analytics/learners/:id
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Returns analytics for a specific learner.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "scenario_title": "Sales Negotiation",
        "overall_score": 78.0,
        "duration_sec": 320,
        "status": "completed",
        "completed_at": "..."
      }
    ],
    "score_trend": [
      { "date": "2025-01-10", "score": 65.0 },
      { "date": "2025-01-15", "score": 78.0 }
    ],
    "time_spent": 1840,
    "progress": {
      "total": 8,
      "completed": 5,
      "in_progress": 1,
      "pending": 2
    }
  }
}
```

`time_spent` is the total seconds across all completed sessions.

| Status | Code |
|---|---|
| `404` | `NOT_FOUND` |

---

### LTI 1.3

All LTI routes are prefixed with `/api/lti`. These endpoints implement the IMS LTI 1.3 specification for integration with Learning Management Systems.

#### JWKS Endpoint

```
GET /api/lti/jwks
```

| Attribute | Value |
|---|---|
| Auth | Public |

Returns the platform's public key set in JWK format for LMS-side id_token verification.

**Success Response** (`200`)

```json
{
  "keys": [
    {
      "kty": "RSA",
      "alg": "RS256",
      "use": "sig",
      "kid": "...",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

---

#### OIDC Login Initiation

```
GET /api/lti/login
```

| Attribute | Value |
|---|---|
| Auth | Public |

Handles the OIDC third-party login initiation. Validates the platform registration and redirects to the LMS authorization endpoint.

**Query Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `iss` | string | Yes | Issuer URL of the LMS |
| `client_id` | string | Yes | Registered client ID |
| `login_hint` | string | Yes | Login hint from the LMS |
| `target_link_uri` | string | No | Target resource URI |
| `lti_message_hint` | string | No | Message hint from the LMS |

| Status | Code |
|---|---|
| `302` | Redirect to LMS auth endpoint |
| `400` | `INVALID_REQUEST` |
| `403` | `UNKNOWN_PLATFORM` |

---

#### Launch Handler

```
POST /api/lti/launch
```

| Attribute | Value |
|---|---|
| Auth | Public (validated via id_token signature) |

Receives the LMS `id_token` via form POST, validates the JWT signature against the platform JWKS, verifies nonce/state, provisions the user, issues platform JWTs, and redirects to the frontend.

Supports both `LtiResourceLinkRequest` and `LtiDeepLinkingRequest` message types.

**Form Body**

| Name | Type | Required | Description |
|---|---|---|---|
| `id_token` | string | Yes | Signed JWT from the LMS |
| `state` | string | Yes | State parameter for CSRF protection |

**Responses**

| Status | Description |
|---|---|
| `302` | Redirect to frontend `/callback#access_token=...` or `/lti/deeplinking?...` |
| `400` | `INVALID_REQUEST`, `INVALID_TOKEN` |
| `403` | `UNKNOWN_PLATFORM`, `INVALID_STATE`, `ISSUER_MISMATCH`, `MISSING_NONCE`, `INVALID_NONCE`, `TOKEN_EXPIRED`, `INVALID_TOKEN` |

---

#### Deep Linking Response

```
POST /api/lti/deeplinking
```

| Attribute | Value |
|---|---|
| Auth | Admin |

Generates a signed Deep Linking response JWT that the frontend posts back to the LMS to register scenario links.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `scenario_ids` | UUID[] | Yes | Scenarios to link |
| `platform_id` | UUID | Yes | LTI platform ID |

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "jwt": "<signed-deep-linking-response>",
    "return_url": "https://lms.example.com/deep_linking/callback",
    "content_items": [
      {
        "type": "ltiResourceLink",
        "title": "Sales Negotiation",
        "url": "https://platform.example.com/api/lti/launch?scenario_id=uuid",
        "custom": { "scenario_id": "uuid" }
      }
    ]
  }
}
```

| Status | Code |
|---|---|
| `400` | `INVALID_REQUEST`, `NO_DL_SESSION` |
| `403` | `FORBIDDEN` |
| `404` | `NOT_FOUND` |

---

#### Grade Passback (AGS)

```
POST /api/lti/grades/:sessionId
```

| Attribute | Value |
|---|---|
| Auth | Authenticated |

Posts the session score back to the LMS via the LTI Assignment and Grade Services (AGS) protocol. Retries once on failure.

**Success Response** (`200`)

```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "score_given": 78.5,
    "score_of": 100,
    "activity_progress": "Completed",
    "grading_progress": "FullyGraded"
  }
}
```

| Status | Code | Description |
|---|---|---|
| `400` | `SESSION_INCOMPLETE`, `NO_PLATFORM`, `NO_AGS`, `NO_LINEITEM` | Precondition failures |
| `404` | `NOT_FOUND` | Session not found |
| `502` | `AGS_FAILED` | LMS rejected the grade passback after retry |

---

## AI Service (Internal)

The AI service is a FastAPI application running on port `8000`. These endpoints are called internally by the API gateway and are **not** exposed to end users.

### Session Orchestration

Prefixed with `/session`.

#### Start Session

```
POST /session/start
```

Spawns the real-time orchestrator (STT, LLM, TTS, avatar rendering) for a training session.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `session_id` | string | Yes | Session UUID |
| `tenant_id` | string | Yes | Tenant UUID |
| `scenario_id` | string | Yes | Scenario UUID |
| `scenario_config` | object | Yes | Title, objective, opening context/message, rubric, limits |
| `persona_config` | object | Yes | System prompt, guardrails, RAG settings, temperature, avatar ID |
| `avatar_provider` | string | No | Provider name (default `simli`) |

**Response** (`200`)

```json
{ "message": "Session starting", "session_id": "uuid" }
```

---

#### End Session

```
POST /session/end
```

Stops the orchestrator and triggers post-session scoring.

**Request Body** (JSON)

| Name | Type | Required |
|---|---|---|
| `session_id` | string | Yes |

**Response** (`200`)

```json
{ "message": "Session ended", "session_id": "uuid" }
```

---

### Embedding Pipeline

Prefixed with `/embedding`.

#### Create Embedding

```
POST /embedding/create
```

Starts asynchronous document processing: download, text extraction, chunking, embedding, and vector storage.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `tenant_id` | string | Yes | Tenant UUID |
| `persona_id` | string | Yes | Persona UUID |
| `document_id` | string | Yes | Document UUID |
| `s3_key` | string | Yes | S3 object key |
| `file_type` | string | Yes | `pdf`, `docx`, `txt`, `md` |
| `original_filename` | string | No | Original file name |
| `reprocess` | boolean | No | If true, deletes old vectors first |

**Response** (`200`)

```json
{ "message": "Processing started", "document_id": "uuid" }
```

---

#### Delete Embedding

```
POST /embedding/delete
```

Deletes all vectors for a document from the vector store.

**Request Body** (JSON)

| Name | Type | Required |
|---|---|---|
| `tenant_id` | string | Yes |
| `persona_id` | string | Yes |
| `document_id` | string | Yes |

**Response** (`200`)

```json
{ "message": "Vectors deleted", "document_id": "uuid" }
```

---

### Scoring Engine

Prefixed with `/scoring`.

#### Evaluate Session

```
POST /scoring/evaluate
```

Fetches the session transcript, runs the LLM-based scoring engine against the rubric, persists the score via the API gateway, and optionally triggers LTI grade passback.

**Request Body** (JSON)

| Name | Type | Required | Description |
|---|---|---|---|
| `session_id` | string | Yes | Session UUID |
| `rubric` | array | Yes | Rubric criteria with levels |
| `persona_context` | string | Yes | Persona system prompt / context |
| `scenario_objective` | string | Yes | Learning objective |
| `tenant_id` | string | Yes | Tenant UUID |
| `assignment_id` | string | No | Assignment UUID |
| `lineitem_url` | string | No | LTI AGS lineitem URL for grade passback |

**Response** (`200`)

```json
{
  "session_id": "uuid",
  "overall_score": 78.5,
  "criteria_scores": [
    {
      "criterion_name": "Communication Clarity",
      "score": 4,
      "weight": 30,
      "justification": "The learner demonstrated..."
    }
  ],
  "strengths": ["Clear articulation"],
  "improvements": ["Ask more open-ended questions"],
  "narrative_feedback": "Overall the learner...",
  "scored_by_model": "gpt-4o"
}
```

| Status | Code | Description |
|---|---|---|
| `502` | -- | Failed to fetch transcript or scoring engine error |
