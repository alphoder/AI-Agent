# Troubleshooting Guide

> For on-call engineers. Each section lists symptoms, diagnosis steps, and resolution.

---

## Table of Contents

1. [Session Issues](#1-session-issues)
2. [Authentication Issues](#2-authentication-issues)
3. [Avatar Issues](#3-avatar-issues)
4. [RAG Pipeline Issues](#4-rag-pipeline-issues)
5. [Scoring Issues](#5-scoring-issues)
6. [Infrastructure Issues](#6-infrastructure-issues)
7. [Monitoring and Debugging](#7-monitoring-and-debugging)

---

## 1. Session Issues

### 1.1 High Latency in Conversation

The orchestrator (`apps/ai-service/src/core/orchestrator.py`) logs per-turn latency at the `turn_latency` structured log event. The critical path is: STT -> Guardrails -> RAG -> LLM -> Avatar. Target is under 2 seconds P95 end-to-end.

**Symptoms**
- Learner perceives long pauses between speaking and avatar response.
- `turn_latency` logs show `total_e2e_ms` above 2000.
- Grafana session latency dashboard shows P95 spikes.

**Diagnosis**
1. Query recent latency logs:
   ```
   {app="ai-service"} |= "turn_latency" | json | total_e2e_ms > 2000
   ```
2. Identify which stage is slow by examining the breakdown fields:
   - `guardrail_ms` -- target < 10ms. If high, check guardrail regex complexity.
   - `rag_ms` -- target < 100ms. If high, check Pinecone latency or OpenAI embedding API latency.
   - `llm_ttft_ms` -- LLM time-to-first-token. If high, OpenAI is throttled or the prompt is too large.
   - `llm_total_ms` -- total LLM streaming time. If high, reduce `max_response_tokens` (currently capped at 256 per persona guardrail config).
3. Check external API status pages: Deepgram, OpenAI, Simli/HeyGen, Pinecone.

**Resolution**
- **STT slow:** Check Deepgram status. The STT client uses nova-2 with 300ms endpointing. If Deepgram latency is elevated, there is nothing to do on our side except wait for their recovery. If STT WebSocket disconnects are frequent, check `stt_reconnecting` logs -- the client retries up to 5 times with exponential backoff (100ms to 2s).
- **RAG slow:** Check Pinecone dashboard for query latency. If embedding calls are slow, check OpenAI rate limits for `text-embedding-3-small`. Reduce `rag_top_k` from 5 to 3 on the persona config as a temporary measure.
- **LLM slow:** Check OpenAI rate limits and model availability. Lower `temperature` or `max_response_tokens` on the persona. If prompt assembly is producing very large prompts, reduce conversation history window (currently 10 turns in Redis, key `session:{id}:history`).
- **Avatar slow:** Check the avatar provider API. Simli retries with delays of [1, 2, 4] seconds on failure, so a single retry adds measurable latency. If Simli is having issues, consider failing over to HeyGen at the tenant config level.

### 1.2 Avatar Not Responding / Video Not Loading

**Symptoms**
- Learner sees a static image or blank video frame.
- Console shows WebRTC connection errors.
- Logs contain `avatar_prewarm_failed` or `avatar_send_failed`.

**Diagnosis**
1. Check orchestrator logs for the session:
   ```
   {app="ai-service"} |= "avatar_" | json | session_id="<SESSION_ID>"
   ```
2. Look for `avatar_prewarm_failed` -- means `create_session` failed during session start.
3. Look for `avatar_send_failed` -- means text-to-speech delivery to the avatar provider is failing mid-session.
4. Check if `avatar_session_id` was ever set (logged at `avatar_session_created`).

**Resolution**
- If prewarm failed, the avatar provider API is likely down or the `provider_avatar_id` on the persona config is invalid. Verify the avatar exists in the provider dashboard.
- If send fails intermittently, the avatar session may have timed out on the provider side. Sessions are not re-established automatically after creation. Ending and restarting the session is the current workaround.
- For WebRTC failures on the client side, check LiveKit server health. Ensure the LiveKit server can reach the avatar provider's WebRTC endpoints (check firewall rules and TURN server config).

### 1.3 Audio Quality Issues

**Symptoms**
- STT produces garbled or inaccurate transcripts.
- Low `stt_confidence` values (below 0.7) in `stt_final` logs.
- Learner reports echo or audio feedback.

**Diagnosis**
1. Check STT final transcript logs:
   ```
   {app="ai-service"} |= "stt_final" | json | confidence < 0.7
   ```
2. Check if the audio encoding matches expectations: the STT client expects opus at 16kHz mono. If the browser is sending a different format, transcription quality degrades.
3. Check for `stt_error` events that indicate Deepgram is rejecting audio frames.

**Resolution**
- Verify the client is sending opus-encoded audio at 16kHz mono. Check the WebRTC audio track constraints in the frontend.
- If confidence is consistently low for a specific user, it may be a microphone or network quality issue on their end. Check for packet loss in WebRTC stats.
- If transcripts are cut short, review the `endpointing_ms` setting (currently 300ms). Increasing it to 500ms gives speakers more pause time before the STT finalizes.
- For echo issues, ensure the frontend has echo cancellation enabled on the audio track (`echoCancellation: true`).

### 1.4 Session Timeout / Idle Disconnect

**Symptoms**
- Session ends unexpectedly.
- Learner is kicked back to the dashboard.
- Logs show `stt_silence_finalize` followed by `session_ending`.

**Diagnosis**
1. Check the STT silence monitor. The client sends a `keep_alive` after 10 seconds of silence (`_silence_timeout = 10.0`). This prevents the Deepgram connection from timing out but does not end the session.
2. Check if the session state expired in Redis. Session history has a 2-hour TTL (`RedisTTL.SESSION_HISTORY = 7200`). Session state also has a 2-hour TTL.
3. Check if the frontend idle timer disconnected the WebSocket.

**Resolution**
- If Redis TTL is the cause, the session data simply expired. This is expected for sessions left idle for over 2 hours. No fix needed -- inform the user.
- If the Deepgram WebSocket closed and exhausted all 5 reconnect attempts, the STT pipeline is dead and the session cannot process audio. Check `stt_reconnect_failed` logs. Root cause is usually network instability between the ai-service pod and Deepgram.
- If the frontend disconnected, check the client-side idle timeout configuration.

### 1.5 WebRTC Connection Failures

**Symptoms**
- Learner cannot join the session.
- Browser console shows ICE connection failed.
- No audio reaches the ai-service.

**Diagnosis**
1. Check LiveKit server logs for connection failures.
2. Verify TURN server is operational (`kubectl get pods -l app=coturn`).
3. Check if the learner is behind a restrictive corporate firewall that blocks UDP traffic.

**Resolution**
- Ensure TURN/STUN servers are configured and reachable. LiveKit needs at least one TURN server for users behind symmetric NATs.
- If a specific user cannot connect, have them try from a different network. Corporate firewalls that block UDP on non-standard ports are the most common cause.
- Check LiveKit server resource usage. If the SFU is overloaded, connections will fail during the ICE negotiation phase.

---

## 2. Authentication Issues

### 2.1 SSO Login Failures (SAML and OIDC)

**Symptoms**
- Users see "Login failed" after being redirected back from the identity provider.
- API logs show 401 or 500 errors on the `/auth/sso/callback` route.

**Diagnosis**
1. Check API auth route logs:
   ```
   {app="api"} |= "sso" | json | level="error"
   ```
2. For SAML: verify the assertion consumer service (ACS) URL matches what is configured in the IdP.
3. For OIDC: verify the redirect URI, client ID, and client secret are correct.
4. Check clock skew. SAML assertions have a validity window. If the server clock is off by more than a few minutes, assertions are rejected.

**Resolution**
- **SAML ACS mismatch:** Update the ACS URL in the IdP to match the platform's callback endpoint.
- **OIDC client secret rotated:** Update `SSO_OIDC_CLIENT_SECRET` in the environment config and restart the API pods.
- **Clock skew:** Ensure NTP is running on all nodes. On Kubernetes, node clock skew is rare but possible if NTP is misconfigured.
- **Certificate issues:** If the IdP rotated its signing certificate, update the SAML metadata in the tenant SSO configuration.

### 2.2 JWT Token Expiration

**Symptoms**
- Users get logged out mid-session.
- API returns `401` with error code `TOKEN_EXPIRED`.
- Frontend shows "Session expired" modal.

**Diagnosis**
1. The auth middleware (`apps/api/src/middleware/auth.ts`) checks for `TokenExpiredError` specifically and returns error code `TOKEN_EXPIRED`.
2. Check if the refresh token flow is working. Refresh tokens are stored in Redis with a 7-day TTL (`RedisTTL.REFRESH_TOKEN = 604800`).
3. Check if Redis is reachable. If the refresh token lookup fails due to Redis being down, the user cannot refresh and gets logged out.

**Resolution**
- If refresh tokens are being lost, check Redis memory and eviction policy. If Redis is evicting keys under memory pressure, refresh tokens (with 7-day TTL) are likely candidates.
- If the access token lifetime is too short for session use, increase it in the JWT service configuration. Current lifetime is defined in the `JWTService` class.
- If the frontend is not calling the refresh endpoint before expiration, check the token refresh interceptor in the Next.js API client.

### 2.3 Role Mapping Misconfiguration

**Symptoms**
- Users authenticated via SSO land with the wrong role (e.g., an instructor sees the learner dashboard).
- Permissions checks fail (403 errors) for actions the user should have access to.

**Diagnosis**
1. Check the tenant SSO role mapping configuration in the database (`tenant_sso_configs` table).
2. Inspect the SAML assertion or OIDC claims to see what role attribute the IdP is sending.
3. Compare the IdP role values against the mapping rules stored in the platform.

**Resolution**
- Update the role mapping in the admin panel under Tenant Settings > SSO Configuration.
- Common pitfall: the IdP sends roles as an array but the mapping expects a single string, or vice versa. Check the claim format.
- If the IdP uses a non-standard attribute name for roles, update the `role_attribute_name` field in the tenant SSO config.

---

## 3. Avatar Issues

### 3.1 Avatar Creation Stuck in "Processing"

**Symptoms**
- Instructor creates an avatar but it stays in "processing" status indefinitely.
- The avatar detail page shows a spinner that never resolves.

**Diagnosis**
1. Check the avatar provider API for the status of the avatar:
   - Simli: `GET /v1/avatars/{avatar_id}` -- look at the `status` field.
   - HeyGen: `GET /v2/photo_avatar/{avatar_id}` -- look at the `status` field.
2. Check API logs for the avatar creation request and any follow-up polling.
3. Check if the source image URL is accessible from the provider's servers (not behind auth, not expired S3 presigned URL).

**Resolution**
- If the provider API shows the avatar failed, the source image likely did not meet requirements (resolution, format, face visibility). Have the instructor re-upload with a compliant image.
- If the provider API shows success but the platform database still says "processing", the status webhook or polling job may have failed. Manually update the avatar status in the database or trigger a re-sync.
- Simli has a 30-second creation timeout configured in the provider. If the avatar takes longer, the request may have timed out. Check `simli_request_retry` logs.

### 3.2 Provider API Errors (Simli/HeyGen)

**Symptoms**
- Logs contain `simli_request_retry` or HTTP 4xx/5xx errors from the provider.
- Sessions fail to start or text-to-speech calls fail mid-conversation.

**Diagnosis**
1. Check provider-specific logs:
   ```
   {app="ai-service"} |= "simli_" | json | level="error"
   {app="ai-service"} |= "heygen_" | json | level="error"
   ```
2. Check the provider's status page for outages.
3. Verify API key validity. Simli uses Bearer token auth, HeyGen uses `X-Api-Key` header.

**Resolution**
- **Rate limiting (429):** Back off and reduce concurrent sessions. Check tenant session limits.
- **Auth errors (401/403):** Rotate or verify the API key. Check `SIMLI_API_KEY` or `HEYGEN_API_KEY` environment variables.
- **Server errors (500+):** Provider-side issue. If persistent, open a support ticket with the provider. As a stopgap, switch the tenant to the alternate provider if one is configured.
- Simli has built-in retry with exponential backoff (delays: 1s, 2s, 4s). HeyGen does not retry automatically. If HeyGen calls fail, the error propagates immediately.

### 3.3 Video Quality Degradation

**Symptoms**
- Avatar video appears pixelated or choppy.
- Lip sync is visibly out of sync with audio.

**Diagnosis**
1. Check the learner's network conditions via WebRTC stats (available in the session debug panel).
2. Check LiveKit server bandwidth metrics.
3. Check if the avatar provider is returning lower-quality streams due to their own load.

**Resolution**
- If the learner's bandwidth is low, LiveKit should be auto-adapting quality via simulcast. Verify simulcast is enabled in the LiveKit room configuration.
- If lip sync is off, the issue is usually latency in the text-to-speech pipeline. Check the `llm_total_ms` and avatar send timing. Sending shorter text chunks to the avatar improves sync.
- For HeyGen, the session is created with `quality: "high"`. If quality is consistently poor, check if the HeyGen account tier supports high-quality streaming.

---

## 4. RAG Pipeline Issues

### 4.1 Document Embedding Failures

**Symptoms**
- Document upload succeeds but the embedding status stays "pending" or moves to "failed".
- Logs show errors from OpenAI embedding API or Pinecone upsert.

**Diagnosis**
1. Check ai-service logs for embedding errors:
   ```
   {app="ai-service"} |= "embed_batch" | json | level="error"
   {app="ai-service"} |= "store_chunks" | json | level="error"
   ```
2. The RAG module (`apps/ai-service/src/core/rag.py`) uses `text-embedding-3-small` (1536 dims) and batches in groups of 100.
3. Check if the OpenAI API key has embedding model access.
4. Check if the Pinecone index exists and has the correct dimension (1536).

**Resolution**
- **OpenAI rate limit:** The embed_batch method processes 100 texts per API call. For large documents (hundreds of chunks), you may hit OpenAI rate limits. Add a delay between batches or request a rate limit increase.
- **Pinecone index mismatch:** If the index was created with a different dimension, upserts will fail silently or error. Verify: `pinecone_index` dimension matches 1536.
- **Pinecone namespace issues:** Vectors are stored under namespace `{tenant_id}:{persona_id}`. If the namespace is wrong, chunks store successfully but retrieval finds nothing.
- **Large documents:** If a document produces thousands of chunks, the embedding job may OOM. Check pod memory limits and consider chunking the embedding job itself.

### 4.2 Poor Retrieval Relevance

**Symptoms**
- Avatar responses are generic and do not reference uploaded knowledge base material.
- Orchestrator logs show `rag_results` with `above_threshold=0` despite documents being uploaded.

**Diagnosis**
1. Check the retrieval logs:
   ```
   {app="ai-service"} |= "rag_results" | json | above_threshold=0
   ```
2. Verify the similarity threshold. Default is 0.70 (`rag_similarity_threshold` on persona config). This may be too high for some content types.
3. Verify the correct namespace is being queried. The retrieve method uses `{tenant_id}:{persona_id}` as the namespace.
4. Check if embeddings actually exist in Pinecone for that namespace (use Pinecone dashboard or API to check vector count).

**Resolution**
- **Threshold too high:** Lower `rag_similarity_threshold` to 0.55-0.60 on the persona config. This trades precision for recall.
- **Wrong namespace:** If vectors were stored under a different persona ID (e.g., after a persona was duplicated), they will not be found. Re-embed the documents under the correct persona.
- **Stale embeddings:** If documents were updated but not re-embedded, the old vectors remain. Delete old vectors (`delete_document_vectors`) and re-run the embedding job.
- **Poor chunking:** If the source document was chunked into very small or very large pieces, retrieval quality suffers. Review the chunking strategy (chunk size, overlap).

### 4.3 Embedding Status Stuck

**Symptoms**
- Document shows "embedding" status indefinitely in the UI.
- No error logs, no progress.

**Diagnosis**
1. Check if the background embedding job is running. Look for the worker process/pod.
2. Check if the job was picked up from the queue (Redis or database job queue).
3. Check for deadlocks or stuck transactions in Postgres.

**Resolution**
- If the worker pod crashed mid-job, the status will remain "embedding" in the database. Manually reset the status to "pending" to allow the job to be retried:
  ```sql
  UPDATE documents SET embedding_status = 'pending' WHERE id = '<doc_id>';
  ```
- If the worker is running but idle, check the job queue for stuck entries.
- Implement or verify that embedding jobs have a timeout (e.g., 10 minutes). If the job exceeds the timeout, it should be marked as failed and eligible for retry.

---

## 5. Scoring Issues

### 5.1 Report Generation Failures

**Symptoms**
- Session ends but no score report is generated.
- Learner sees "Report unavailable" on the session review page.

**Diagnosis**
1. Check if the session ended cleanly. Look for `session_ended` logs with the correct session ID and turn count.
2. Check the scoring service/job for errors:
   ```
   {app="api"} |= "scoring" | json | level="error"
   ```
3. Check if the LLM scoring call (which evaluates the transcript against the rubric) succeeded.

**Resolution**
- If the session had zero turns, scoring is skipped by design. Inform the learner.
- If the LLM scoring call failed (OpenAI error), retry the scoring job. Most scoring implementations allow manual re-trigger via an admin endpoint or database flag.
- If the rubric configuration is missing or malformed on the scenario, scoring will fail. Check the scenario's rubric JSON in the database.

### 5.2 LTI Grade Passback Errors

**Symptoms**
- Score is generated in the platform but does not appear in the LMS gradebook.
- Logs show errors on LTI score passback.

**Diagnosis**
1. Check LTI-related logs:
   ```
   {app="api"} |= "lti" | json | level="error"
   ```
2. Verify the LTI launch context stored for the session includes the `lineitem` URL (required for grade passback in LTI 1.3).
3. Check if the LTI nonce has expired. LTI nonces are stored in Redis with a 10-minute TTL (`RedisTTL.LTI_NONCE = 600`).
4. Check if the platform's OAuth2 token for the LMS has expired.

**Resolution**
- **Missing lineitem URL:** The LMS did not provide a grade passback endpoint in the launch. This happens when the LTI link is configured as a "link" rather than an "assignment" in the LMS. Have the instructor reconfigure the LTI placement.
- **OAuth2 token expired:** Refresh the platform-to-LMS access token using the stored refresh token. If the refresh token is also expired, the LTI registration needs to be re-authorized.
- **Score format mismatch:** LTI 1.3 expects a score between 0.0 and 1.0 as a ratio. If the platform sends a percentage (0-100), the LMS will reject it. Check the score normalization logic.
- **Network issue:** If the API cannot reach the LMS endpoint, grade passback fails. Verify outbound connectivity from the API pods to the LMS domain.

---

## 6. Infrastructure Issues

### 6.1 Database Connection Pool Exhaustion

**Symptoms**
- API requests time out with connection errors.
- Logs show `Unexpected database pool error` or connection timeout messages.
- Postgres `pg_stat_activity` shows connections at or near the max.

**Diagnosis**
1. The pool is configured in `apps/api/src/config/database.ts`:
   - `min: 2`, `max: 20`
   - `idleTimeoutMillis: 30000` (30s idle before release)
   - `connectionTimeoutMillis: 5000` (5s to acquire a connection)
2. Check current connection count:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = '<dbname>';
   ```
3. Check for long-running transactions:
   ```sql
   SELECT pid, now() - xact_start AS duration, query
   FROM pg_stat_activity
   WHERE state = 'active' AND xact_start < now() - interval '30 seconds';
   ```
4. Check how many API pods are running. Each pod has a pool of up to 20 connections. With 5 pods, that is 100 connections.

**Resolution**
- **Long-running transactions:** Kill them with `SELECT pg_terminate_backend(<pid>);`. Investigate the source (likely a missing `client.release()` or a slow query in a `withTenant` call).
- **Too many pods:** If you scaled up API pods, total connection demand may exceed Postgres `max_connections`. Increase `max_connections` in Postgres config or reduce `max` pool size per pod.
- **Leaked connections:** The `withTenant` method uses try/finally to ensure `client.release()`. If custom code acquires clients via `db.getClient()` without releasing, connections leak. Audit recent code changes.
- **Immediate relief:** Restart API pods to reset all connection pools. This is disruptive but clears leaked connections.

### 6.2 Redis Connection Issues

**Symptoms**
- API logs show `Redis connection error`.
- Sessions fail to start (cannot load history from Redis).
- Rate limiting stops working (all requests pass through or all are blocked).

**Diagnosis**
1. Redis client config (`apps/api/src/config/redis.ts`): retries up to 3 times per request with exponential backoff (50ms base, max 2s).
2. The ai-service also connects to Redis directly via `aioredis.from_url(settings.redis_url)`.
3. Check Redis pod status: `kubectl get pods -l app=redis`.
4. Check Redis memory usage: `redis-cli INFO memory`.

**Resolution**
- **Redis pod down:** Check why it restarted (OOM, crash). Review `kubectl describe pod` and `kubectl logs` for the Redis pod.
- **Memory full:** Redis is likely configured with `maxmemory-policy allkeys-lru` or `noeviction`. If `noeviction`, writes fail when memory is full. Flush expired keys or increase memory limit.
- **Network partition:** If Redis is reachable from some pods but not others, check Kubernetes network policies and DNS resolution (`redis-service` hostname).
- **Connection storm:** If many pods reconnect simultaneously after a Redis restart, Redis may reject connections. The client retries (3 attempts, 50ms-2s backoff) but may still fail. Stagger pod restarts if needed.

### 6.3 Pod Restart Loops (CrashLoopBackOff)

**Symptoms**
- `kubectl get pods` shows pods in `CrashLoopBackOff` state.
- Service is intermittently unavailable.

**Diagnosis**
1. Get the restart reason:
   ```
   kubectl describe pod <pod-name> -n <namespace>
   ```
   Look at the `Last State` section for the exit code:
   - Exit code 137: OOMKilled
   - Exit code 1: Application error
   - Exit code 143: SIGTERM (graceful shutdown, unexpected if looping)
2. Check recent logs from the crashing pod:
   ```
   kubectl logs <pod-name> --previous
   ```
3. Check if a recent deployment introduced a config or code error.

**Resolution**
- **OOMKilled (137):** Increase memory limits in the pod spec. Check if there is a memory leak (e.g., unbounded conversation history in memory, large file processing without streaming).
- **Application error (1):** Read the logs. Common causes: missing environment variable, database migration not applied, invalid config file.
- **Failing health check:** If the liveness probe is too aggressive, the pod gets killed before it finishes starting. Increase `initialDelaySeconds` and `timeoutSeconds` on the probe.
- **Dependency not ready:** If the pod crashes because Redis or Postgres is not yet available, add an init container or startup probe that waits for dependencies.

### 6.4 High Memory Usage

**Symptoms**
- Pods approaching memory limits.
- OOMKill events in Kubernetes.
- Grafana memory dashboard shows steady memory growth.

**Diagnosis**
1. Check which service is affected:
   - **ai-service (Python):** Large in-memory objects (conversation history, embedding batches, audio buffers). The STT client has a 5-second ring buffer (`maxlen = 5 * 16000 * 2` = ~160KB per session). With many concurrent sessions, this adds up.
   - **api (Node.js):** Connection pool overhead, large query results held in memory, unbounded caches.
2. Check `kubectl top pods` for current usage.
3. Look for memory growth patterns: steady growth = leak, spiky = load-driven.

**Resolution**
- **ai-service:** Each `SessionOrchestrator` instance holds a Redis connection, STT client, LLM client, RAG retriever, and avatar provider. Ensure sessions are properly cleaned up via `orchestrator.end()` which closes STT, avatar, and Redis. If `end()` is not called (e.g., WebSocket drops without cleanup), resources leak.
- **api:** Audit for large in-memory caches. Tenant config cache in Redis (`RedisTTL.TENANT_CONFIG = 300`) should prevent repeated DB queries, but if the application also caches in-process, that duplicates memory usage.
- **General:** Set appropriate memory requests and limits in Kubernetes manifests. Use a vertical pod autoscaler (VPA) if available, or tune manually based on observed usage patterns.

---

## 7. Monitoring and Debugging

### 7.1 Key Grafana Dashboards

| Dashboard | What to Check |
|---|---|
| **Session Latency** | P50/P95/P99 of `total_e2e_ms`, broken down by STT, RAG, LLM, and avatar stages |
| **Active Sessions** | Current session count per tenant, tracked via `tenant:{tenantId}:active_sessions` in Redis |
| **API Request Rate** | Request rate, error rate (4xx/5xx), latency percentiles for the Express API |
| **Database Connections** | Pool utilization (active vs idle connections per pod), query duration percentiles |
| **Redis** | Memory usage, connected clients, ops/sec, evicted keys |
| **Pod Resources** | CPU and memory per pod, restart counts, OOMKill events |
| **External API Health** | Latency and error rate for Deepgram, OpenAI, Simli/HeyGen, Pinecone |

### 7.2 Log Queries (Loki)

All services use structured JSON logging (structlog for Python, pino/logger for Node.js).

**Session lifecycle:**
```
{app="ai-service"} |= "session_" | json | session_id="<SESSION_ID>"
```

**STT errors and reconnects:**
```
{app="ai-service"} |= "stt_" | json | level=~"error|warn"
```

**Avatar provider errors:**
```
{app="ai-service"} |= "simli_" OR |= "heygen_" | json | level="error"
```

**Auth failures:**
```
{app="api"} |= "JWT verification failed" OR |= "TOKEN_EXPIRED"
```

**Database errors:**
```
{app="api"} |= "database pool error" OR |= "ROLLBACK"
```

**Slow turns (over 2s):**
```
{app="ai-service"} |= "turn_latency" | json | total_e2e_ms > 2000
```

**Guardrail triggers:**
```
{app="ai-service"} |= "guardrail_triggered" | json
```

### 7.3 Prometheus Metrics to Check

| Metric | Alert Threshold | Meaning |
|---|---|---|
| `session_e2e_latency_seconds` (histogram) | P95 > 2s | End-to-end turn latency exceeding target |
| `stt_reconnect_total` (counter) | > 5/min per pod | STT WebSocket instability |
| `avatar_send_errors_total` (counter) | > 0 sustained | Avatar provider unreachable |
| `pg_pool_active_connections` (gauge) | > 80% of max (16/20) | Connection pool nearing exhaustion |
| `redis_connected_clients` (gauge) | Sudden drop to 0 | Redis connectivity lost |
| `http_request_duration_seconds` (histogram) | P95 > 1s | API response time degradation |
| `http_requests_total{status=~"5.."}` (counter) | > 1% of traffic | Elevated server error rate |
| `node_memory_working_set_bytes` (gauge) | > 85% of limit | Pod approaching OOM |
| `kube_pod_container_status_restarts_total` (counter) | > 3 in 10min | Pod crash loop |

### 7.4 Common Alerting Resolutions

**Alert: HighSessionLatency**
- Check `turn_latency` logs to find the slow stage.
- Check external API status pages.
- If LLM is the bottleneck, check OpenAI rate limits and consider reducing max tokens.

**Alert: DatabaseConnectionPoolExhausted**
- Run `SELECT count(*) FROM pg_stat_activity` to confirm.
- Kill long-running transactions.
- Check if recent code changes introduced connection leaks.
- If under sustained load, scale pods down or increase Postgres max_connections.

**Alert: RedisDown**
- Check Redis pod status and logs.
- If OOMKilled, increase memory limit.
- If data loss is acceptable (session caches), restart Redis. Refresh tokens (7-day TTL) will be lost, forcing users to re-login.

**Alert: PodCrashLoop**
- Check `kubectl logs <pod> --previous` for the crash reason.
- Exit 137 = OOM, increase memory.
- Exit 1 = check for missing env vars or failed DB migrations.
- Roll back the last deployment if the crash started after a deploy.

**Alert: ExternalAPIErrorRate**
- Identify which provider is failing from the logs.
- Check provider status page.
- If Simli is down, switch affected tenants to HeyGen (or vice versa) via tenant config.
- If OpenAI is rate-limited, reduce concurrent sessions or switch to a fallback model.

**Alert: HighMemoryUsage**
- Check `kubectl top pods` to identify the offending pod.
- For ai-service: check active session count. Each session consumes memory for the STT buffer, history, and client objects.
- For api: check for in-memory cache growth.
- Restart the pod as immediate mitigation, then investigate the leak.
