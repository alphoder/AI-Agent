# AI Avatar Training Platform — Deployment Runbook

> **Last updated:** 2026-03-18
> **Owner:** Platform Engineering
> **Review cadence:** Every major release or quarterly

---

## Table of Contents

1. [Pre-deploy Checklist](#pre-deploy-checklist)
2. [Deploy Order](#deploy-order)
3. [Rollback Procedure](#rollback-procedure)
4. [Incident Response](#incident-response)
5. [Environment Variables Checklist](#environment-variables-checklist)
6. [Monitoring and Verification](#monitoring-and-verification)

---

## Pre-deploy Checklist

Before initiating any deployment, verify every item in this checklist. All items must be confirmed by the deploy engineer.

| # | Item | Verified |
|---|------|----------|
| 1 | CI pipeline is green on the target branch (all unit, integration, and E2E tests pass) | [ ] |
| 2 | Load test results reviewed — last run completed within the past 48 hours | [ ] |
| 3 | Security scan clean: `npm audit --audit-level=high`, `pip audit`, Trivy container scan | [ ] |
| 4 | Database migration tested successfully on the staging environment | [ ] |
| 5 | Feature flags configured in LaunchDarkly / environment config for any new features | [ ] |
| 6 | Rollback plan documented and reviewed by a second engineer | [ ] |
| 7 | Changelog prepared and posted to #releases Slack channel | [ ] |
| 8 | On-call engineer identified and available for the deploy window | [ ] |
| 9 | External dependency status verified (OpenAI, Deepgram, LiveKit, Pinecone) | [ ] |
| 10 | Customer-facing maintenance window scheduled (if applicable) | [ ] |

---

## Deploy Order

Deployments follow a strict ordering to maintain data consistency and avoid downtime. Each step must complete and pass health checks before proceeding.

### Step 1: Database Migrations

```bash
# From the api application directory
cd apps/api

# Run pending migrations against the target database
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx node-pg-migrate up

# Verify migration status
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx node-pg-migrate status
```

**Validation:**
- Confirm all migrations applied without errors
- Spot-check new columns/tables exist via `psql`
- Verify RLS policies are intact: `SELECT tablename, policyname FROM pg_policies;`

**Rollback trigger:** If any migration fails, stop the deployment immediately. Do NOT proceed to service deployments.

### Step 2: AI Service (Python/FastAPI)

```bash
# Rolling update — zero-downtime deployment
kubectl set image deployment/ai-service \
  ai-service=registry.example.com/ai-service:$TAG \
  -n avatar-ai

# Wait for rollout to complete
kubectl rollout status deployment/ai-service -n avatar-ai --timeout=300s

# Verify health
kubectl exec -n avatar-ai deployment/ai-service -- curl -sf http://localhost:8000/health
```

**Validation:**
- Health endpoint returns `200 OK`
- GPU pods are scheduled and ready (if applicable)
- STT and TTS pipelines respond to test payloads

### Step 3: API Gateway (Node.js/Express)

```bash
# Rolling update
kubectl set image deployment/api-gateway \
  api-gateway=registry.example.com/api-gateway:$TAG \
  -n avatar-api

# Wait for rollout
kubectl rollout status deployment/api-gateway -n avatar-api --timeout=300s

# Verify health
curl -sf https://api.example.com/health
```

**Validation:**
- `/health` returns `200 OK`
- Database connection pool is healthy
- Redis connection is active
- JWT validation works (test with a known token)

### Step 4: Frontend (Next.js)

```bash
# Rolling update
kubectl set image deployment/frontend \
  frontend=registry.example.com/frontend:$TAG \
  -n avatar-frontend

# Wait for rollout
kubectl rollout status deployment/frontend -n avatar-frontend --timeout=300s

# Verify
curl -sf https://app.example.com/ | head -1
```

**Validation:**
- Application loads in a browser
- Static assets served correctly (check network tab for 404s)
- SSO login flow completes end-to-end

### Step 5: Smoke Tests

Run the automated smoke test suite after all services are deployed:

```bash
# Run E2E smoke tests against production
pnpm run test:e2e:smoke --env=production

# Manual smoke test checklist:
# [ ] SSO login redirects correctly
# [ ] Dashboard loads with data
# [ ] Can start a training session (LiveKit room created)
# [ ] Can end a session and view the report
# [ ] Admin analytics page renders
```

### Step 6: Monitoring Verification

```bash
# Check for new alerts in the last 15 minutes
kubectl get events -n avatar-api --sort-by='.lastTimestamp' | tail -20
kubectl get events -n avatar-ai --sort-by='.lastTimestamp' | tail -20

# Verify pod resource usage
kubectl top pods -n avatar-api
kubectl top pods -n avatar-ai
kubectl top pods -n avatar-frontend
```

**Grafana dashboards to check:**
- API Gateway: request rate, error rate, P95 latency
- AI Service: inference latency, GPU utilization, queue depth
- Database: connection count, query duration, replication lag
- Redis: memory usage, hit rate, connected clients
- LiveKit: active rooms, participant count

---

## Rollback Procedure

### Immediate Rollback (within 5 minutes of failure detection)

```bash
# Roll back the failing service
kubectl rollout undo deployment/<service-name> -n <namespace>

# Verify rollback completed
kubectl rollout status deployment/<service-name> -n <namespace> --timeout=120s

# Specific services:
kubectl rollout undo deployment/ai-service -n avatar-ai
kubectl rollout undo deployment/api-gateway -n avatar-api
kubectl rollout undo deployment/frontend -n avatar-frontend
```

### Database Rollback

Only execute if the migration introduced data corruption or breaking schema changes:

```bash
# Roll back the last migration
cd apps/api
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx node-pg-migrate down

# Verify rollback
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx node-pg-migrate status
```

**WARNING:** Down migrations can cause data loss. Always verify the down migration logic before running in production. If the migration added a column with data already written to it, consult the team before rolling back.

### Post-Rollback Verification

1. Run health checks on all services
2. Verify Grafana dashboards show normal metrics
3. Confirm no new error alerts in PagerDuty
4. Test critical user flows (login, session creation, report viewing)
5. Post rollback summary in #incidents Slack channel

---

## Incident Response

### Severity Levels

| Severity | Definition | Response SLA | Escalation | Communication |
|----------|-----------|-------------|------------|---------------|
| **P1 — Platform Down** | All users cannot access the platform, or training sessions are completely broken | 15 minutes | PagerDuty escalation to all on-call engineers; all-hands war room | Status page update within 30 min; customer email within 1 hour |
| **P2 — Degraded** | Platform is accessible but with degraded performance (high latency, partial feature failure) | 1 hour | Slack #incident channel; on-call engineer investigates | Status page update if customer-visible; internal update in #incident |
| **P3 — Bug** | Non-critical bug affecting a subset of users or a non-essential feature | Next business day | JIRA ticket created; assigned to normal sprint process | No external communication unless requested |

### P1 Incident Procedure

1. **Acknowledge** the PagerDuty alert within 5 minutes
2. **Open** a war room (Slack huddle or Zoom bridge)
3. **Assess** — determine which service(s) are affected:
   ```bash
   kubectl get pods -A | grep -v Running
   kubectl logs deployment/api-gateway -n avatar-api --tail=100
   kubectl logs deployment/ai-service -n avatar-ai --tail=100
   ```
4. **Mitigate** — apply immediate fix (rollback, scale up, restart)
5. **Communicate** — update status page and notify stakeholders
6. **Resolve** — confirm platform is operational
7. **Post-mortem** — schedule within 48 hours; document in Notion

### P2 Incident Procedure

1. **Acknowledge** in Slack #incident channel
2. **Investigate** root cause using logs and metrics
3. **Apply** fix or schedule for next deploy window
4. **Document** findings in JIRA ticket

### Useful Diagnostic Commands

```bash
# Check pod status across all namespaces
kubectl get pods -n avatar-api
kubectl get pods -n avatar-ai
kubectl get pods -n avatar-frontend

# View recent logs
kubectl logs -n avatar-api deployment/api-gateway --tail=200 --since=10m
kubectl logs -n avatar-ai deployment/ai-service --tail=200 --since=10m

# Check resource pressure
kubectl top nodes
kubectl describe node <node-name> | grep -A 5 "Allocated resources"

# Database connection check
kubectl exec -n avatar-api deployment/api-gateway -- \
  node -e "const { Pool } = require('pg'); const p = new Pool(); p.query('SELECT 1').then(() => console.log('DB OK')).catch(console.error)"

# Redis connectivity
kubectl exec -n avatar-api deployment/api-gateway -- \
  node -e "const Redis = require('ioredis'); const r = new Redis(process.env.REDIS_URL); r.ping().then(console.log).catch(console.error)"
```

---

## Environment Variables Checklist

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Runtime environment: `development`, `staging`, or `production` |
| `PORT` | No | `4000` | API server listen port |
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/avatar_platform` | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection string for caching and session counters |
| `JWT_PRIVATE_KEY` | Yes | — | RSA/EC private key for signing JWTs (PEM format) |
| `JWT_PUBLIC_KEY` | Yes | — | RSA/EC public key for verifying JWTs (PEM format) |
| `OPENAI_API_KEY` | Yes (prod) | — | OpenAI API key for LLM inference |
| `DEEPGRAM_API_KEY` | Yes (prod) | — | Deepgram API key for speech-to-text |
| `SIMLI_API_KEY` | No | — | Simli API key for avatar rendering (if using Simli provider) |
| `HEYGEN_API_KEY` | No | — | HeyGen API key for avatar rendering (if using HeyGen provider) |
| `LIVEKIT_API_KEY` | Yes | `devkey` | LiveKit server API key |
| `LIVEKIT_API_SECRET` | Yes | `devsecret` | LiveKit server API secret |
| `LIVEKIT_URL` | Yes | `ws://localhost:7880` | LiveKit server WebSocket URL |
| `S3_BUCKET` | Yes | `avatar-platform` | S3 bucket name for file storage (reports, audio) |
| `S3_REGION` | Yes | `us-east-1` | AWS region for S3 bucket |
| `S3_ENDPOINT` | No | — | Custom S3 endpoint (for MinIO or non-AWS S3) |
| `S3_ACCESS_KEY` | Yes | — | S3 access key ID |
| `S3_SECRET_KEY` | Yes | — | S3 secret access key |
| `PINECONE_API_KEY` | Yes (prod) | — | Pinecone API key for RAG vector search |
| `PINECONE_INDEX` | Yes | `avatar-platform` | Pinecone index name |
| `AI_SERVICE_URL` | Yes | `http://localhost:8000` | Internal URL of the AI/ML service |
| `CORS_ORIGINS` | Yes | `http://localhost:3000` | Comma-separated list of allowed CORS origins |

### Secrets Management

- **Production:** All secrets are stored in AWS Secrets Manager and injected via ExternalSecret CRDs in Kubernetes.
- **Staging:** Secrets are stored in the same AWS Secrets Manager under a `/staging/` prefix.
- **Local development:** Use `.env` files (never committed to version control).

---

## Monitoring and Verification

### Health Check Endpoints

| Service | Endpoint | Expected Response |
|---------|----------|-------------------|
| API Gateway | `GET /health` | `200 OK` with `{"status":"healthy"}` |
| AI Service | `GET /health` | `200 OK` with `{"status":"healthy"}` |
| Frontend | `GET /` | `200 OK` (HTML page) |
| LiveKit | `GET :7880` | `200 OK` |

### Key Metrics to Monitor Post-Deploy

| Metric | Normal Range | Alert Threshold |
|--------|-------------|-----------------|
| API P95 latency | < 500ms | > 2000ms |
| API error rate | < 0.1% | > 1% |
| AI inference latency | < 2s | > 5s |
| Active LiveKit rooms | varies | > 500 (capacity) |
| Database connections | < 50 | > 80 (pool max) |
| Redis memory | < 500MB | > 1GB |
| Pod restarts (15m) | 0 | > 2 |

### Deploy Window

- **Preferred:** Tuesday through Thursday, 10:00-14:00 UTC
- **Avoid:** Fridays, weekends, holidays, or within 2 hours of a scheduled demo
- **Emergency hotfixes:** Any time, with P1 incident procedure active
