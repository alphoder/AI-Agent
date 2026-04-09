# Deployment Guide - AI Avatar Training Platform

This guide walks through deploying the AI Avatar Training Platform to production:
- **Frontend**: Vercel (free tier)
- **API**: Render (free tier)
- **AI Service**: Render (free tier)
- **Database**: Neon PostgreSQL (already provisioned)
- **Cache**: Upstash Redis TLS (already provisioned)
- **Video**: LiveKit Cloud (already provisioned)

Estimated deployment time: 20-30 minutes.

## Prerequisites

- GitHub repo: https://github.com/alphoder/AI-Agent.git (forked, with all commits pushed)
- Vercel account: https://vercel.com (free)
- Render account: https://render.com (free)
- All infrastructure already provisioned:
  - Neon Postgres database
  - Upstash Redis with TLS
  - LiveKit Cloud instance
  - AI provider API keys (Groq, Deepgram, Simli, HeyGen, Pinecone)

## Step 1: Push Code to GitHub

All changes must be committed and pushed to GitHub first.

```bash
cd /path/to/AI-Agent
git status  # Review changes before committing

git add .
git commit -m "chore: prepare for production deployment

- Fix TypeScript errors in admin overview page
- Sync environment variables across services
- Add render.yaml for Render.com deployment
- Update .env.local for frontend"

git push origin main
```

**VERIFY**: Check https://github.com/alphoder/AI-Agent and confirm the commit appears.

---

## Step 2: Deploy AI Service to Render

The AI service must deploy first because the API needs its URL.

### 2a. Create Service on Render

1. Go to https://render.com/dashboard
2. Click **"New +"** → **"Web Service"**
3. Select **"Build and deploy from a Git repository"**
4. Connect your GitHub account and select **`alphoder/AI-Agent`**
5. Fill in:
   - **Name**: `avatar-ai`
   - **Root Directory**: `apps/ai-service`
   - **Runtime**: `Python 3.11`
   - **Build Command**: `pip install --upgrade pip && pip install -e .`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
6. Click **"Create Web Service"**

### 2b. Add Environment Variables

Once the service is created, go to **Settings** → **Environment Variables** and add:

```
DATABASE_URL=postgresql://neondb_owner:npg_yJIe0Tk6MUvq@ep-floral-rain-amjx6wfo-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
REDIS_URL=rediss://default:gQAAAAAAAT6yAAIncDIxNTFhZjRiMDhhOWQ0NGI3Yjg5OTA3YzhkZmNhYTVkOHAyODE1ODY@boss-swan-81586.upstash.io:6379
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC4Uxoyw8Ecxgwz\nFYYfxtWlmV9hWgjxSQPbOAZ3N+qiIMj61+h8R5up/6dryP1LC5MO6AYINpGo3aY+\nt3m0ANqM2Jcjv20vwbQUMHsU5DJkENC5EbnRoUTqmGOWGBu/WPlGRAL4mV3vIjid\n4knfocnTt5Ke2BXNb3wbiLisfxWeCxQ3RgI1HgTEOVFxLwQL1tq/BygJ+XNy+gY7\nuQ39usIelgg05a7zxF4MZLb7Y4fqsTFQgd/5wI7hfkmJILVrAQ51h5QOGqkwp3tf\nJqGg7FgJmTlmsYA8OqEKqtq/E/C8LRUhM0mFAg5vU3JWntvT7CAZXOYDMeQZHK9M\nVE6gVTfxAgMBAAECggEAR/UFPrkl2+ZC3/RwolockKPR1O7xm8RN0ZhLCeKV4gob\ne7WrCE1qKxDnWpAhtdjEZabVqAIplftFialVxRwqNZ7eTfHOnbyoYNNWUV8OfvsD\niKQvXvNutIieI/uwZWBGHBSz9jnlLlQ1NwmenkOKR3EcN4+S31q84ADdW1XXahUu\nhk8obWTMQyzcYosWvPyNrpruJ4SE3qfYRxvHfEYrbFD376wpYawdbeK0NDk5SmhC\n4IbA4HD78lawKQVHTYgwkAhY+FN8sYH896jtIEi9YG6I0l2AuMdrGgg1KxETytLf\nzkSRQeUrWzGGWdNZL/FRlo8mIyOuQ80mhdLxqmnAOwKBgQDWfJwxax3XcKd6NPi6\nIT5TGbTFNcPefDC0U6tMlnZ78gmP3sK0FdOa2nHuPJ9XsQ7L6ud5karcWlvwnzal\ntVhsH95ArKKvhI95N7WtyGSHBjWfm+Hclau6BM3fpLQ4DaMSwIjK/ngELECqWdGc\n4mCqyzm2WXIoWUEIYSN7Gxmx4wKBgQDcAAS8/x7fw8bB19yPxJcDI5O/ft2rd0Rd\neAubtcSGWRd94N/p7vDYtUgUdO1of3YL3/NuDeQ7yanBGs88pMng2GGoQ/Dyxero\nBtpA4BdpazZ7HBJxn1zJzPsNVNEcicpJcv+Um/pZvxrKZTzsYXFEXeeVSB8lqeur\nIatGhsjHGwKBgQCFt+ZAwQE3wVoITGIM2JDcihgzItPcLxzGL6uJ8fwoRbtEYKKO\nV1U3I50H4++LYi1RYD+zgOc+vW64Uupk4OwhbLTJKVe7iS9RaTPxBg/2Rh7ERRDI\nzt7i9//JwAtDLu1N0Y72zzLPly8xhRGzd0bA9DYkwxryoMJ0kOrn4vtf9QKBgClM\nu5b7UcFyEErtihNXNX46XI8zcsuwnR3q3ksB6X3LFdTktURGPeKAzaJBfRwD6ZY7\nGYjMhM8QgZSlwsfAq8FQ/axH7OC2dO3P84MAToTUwqqDz5aS8ylTGMIc7RCtcVMu\ninpMecgFTzM1pCU/+bJ66nGk02wPpRVAQdYAkYqHAoGBAMng5k6okAqCeb1Jo/zH\nxrcEK7u3nIZzlpXH8hfydyKKf4h0X8lBdteisSplFQJvt3LJGfDKE5DnLFPT1wO0\njXJdvuu6hZmEKWtG76PpACMuZTcoX5NtvzkBmDvQ8pI2skimdKRPCbg7hb02zB24\n9iNL2BWAkLHgct2zK/e1L53u\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFMaMsPBHMYMMxWGH8bV\npZlfYVoI8UkD2zgGdzfqoiDI+tfofEebqf+na8j9SwuTDugGCDaRqN2mPrd5tADa\njNiXI79tL8G0FDB7FOQyZBDQuRG50aFE6phjlhgbv1j5RkQC+Jld7yI4neJJ36HJ\n07eSntgVzW98G4i4rH8VngsUN0YCNR4ExDlRcS8EC9bavwcoCflzcvoGO7kN/brC\nHpYINOWu88ReDGS2+2OH6rExUIHf+cCO4X5JiSC1awEOdYeUDhqpMKd7XyahoOxY\nCZk5ZrGAPDqhCqravxPwvC0VITNJhQIOb1NyVp7b0+wgGVzmAzHkGRyvTFROoFU3\n8QIDAQAB\n-----END PUBLIC KEY-----
LLM_PROVIDER=groq
TTS_PROVIDER=deepgram
GROQ_API_KEY=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
DEEPGRAM_API_KEY=24ba0afa23237e77c0f5fa0fbf7f2922cbe6a4a8
OPENAI_API_KEY=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
SIMLI_API_KEY=ukkwy22jn1glilf5j0xxcp
HEYGEN_API_KEY=sk_V2_hgu_kYUEW3eYuQT_Wawh9h4yRT5M5Vft7vWwCN6wuKSaWjlk
PINECONE_API_KEY=pcsk_47DbK4_47VPj28q3rAVPR2BomvCM5Qzod6kcjvuiNirR3g7wVGzddadfvYpASfsk4RaHrG
PINECONE_INDEX=avatar-platform
LIVEKIT_API_KEY=API2Z5vzpWgF9zj
LIVEKIT_API_SECRET=GfRGcHN0XcqGq6ae2qTG7n8aP7AmRUrunj8A3W3DJt5
LIVEKIT_URL=wss://aiavatar-kuold3h8.livekit.cloud
S3_BUCKET=avatar-platform
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
API_GATEWAY_URL=http://localhost:4000
INTERNAL_API_KEY=b228e9303116f0338d83adf92f634724a40d5c936d367284d6fbdc9fa8ebe11f
PORT=8000
```

**Note**: The JWT keys contain newlines. When pasting into Render, replace actual newlines with `\n` (escape sequences).

3. Click **"Save"** and wait for deployment (2-5 minutes)
4. Check the **Logs** tab to ensure the service is running
5. Look for `Uvicorn running on` message confirming startup

**CAPTURE**: Copy the service URL from the dashboard, e.g., `https://avatar-ai-xxxxx.onrender.com`

---

## Step 3: Deploy API to Render

### 3a. Create Service on Render

1. Go to https://render.com/dashboard
2. Click **"New +"** → **"Web Service"**
3. Select **"Build and deploy from a Git repository"**
4. Connect GitHub and select **`alphoder/AI-Agent`** again
5. Fill in:
   - **Name**: `avatar-api`
   - **Root Directory**: `apps/api`
   - **Runtime**: `Node`
   - **Node Version**: `20`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/index.js`
   - **Instance Type**: `Free`
6. Click **"Create Web Service"**

### 3b. Add Environment Variables

Once created, go to **Settings** → **Environment Variables** and add:

```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://neondb_owner:npg_yJIe0Tk6MUvq@ep-floral-rain-amjx6wfo-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
REDIS_URL=rediss://default:gQAAAAAAAT6yAAIncDIxNTFhZjRiMDhhOWQ0NGI3Yjg5OTA3YzhkZmNhYTVkOHAyODE1ODY@boss-swan-81586.upstash.io:6379
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC4Uxoyw8Ecxgwz\nFYYfxtWlmV9hWgjxSQPbOAZ3N+qiIMj61+h8R5up/6dryP1LC5MO6AYINpGo3aY+\nt3m0ANqM2Jcjv20vwbQUMHsU5DJkENC5EbnRoUTqmGOWGBu/WPlGRAL4mV3vIjid\n4knfocnTt5Ke2BXNb3wbiLisfxWeCxQ3RgI1HgTEOVFxLwQL1tq/BygJ+XNy+gY7\nuQ39usIelgg05a7zxF4MZLb7Y4fqsTFQgd/5wI7hfkmJILVrAQ51h5QOGqkwp3tf\nJqGg7FgJmTlmsYA8OqEKqtq/E/C8LRUhM0mFAg5vU3JWntvT7CAZXOYDMeQZHK9M\nVE6gVTfxAgMBAAECggEAR/UFPrkl2+ZC3/RwolockKPR1O7xm8RN0ZhLCeKV4gob\ne7WrCE1qKxDnWpAhtdjEZabVqAIplftFialVxRwqNZ7eTfHOnbyoYNNWUV8OfvsD\niKQvXvNutIieI/uwZWBGHBSz9jnlLlQ1NwmenkOKR3EcN4+S31q84ADdW1XXahUu\nhk8obWTMQyzcYosWvPyNrpruJ4SE3qfYRxvHfEYrbFD376wpYawdbeK0NDk5SmhC\n4IbA4HD78lawKQVHTYgwkAhY+FN8sYH896jtIEi9YG6I0l2AuMdrGgg1KxETytLf\nzkSRQeUrWzGGWdNZL/FRlo8mIyOuQ80mhdLxqmnAOwKBgQDWfJwxax3XcKd6NPi6\nIT5TGbTFNcPefDC0U6tMlnZ78gmP3sK0FdOa2nHuPJ9XsQ7L6ud5karcWlvwnzal\ntVhsH95ArKKvhI95N7WtyGSHBjWfm+Hclau6BM3fpLQ4DaMSwIjK/ngELECqWdGc\n4mCqyzm2WXIoWUEIYSN7Gxmx4wKBgQDcAAS8/x7fw8bB19yPxJcDI5O/ft2rd0Rd\neAubtcSGWRd94N/p7vDYtUgUdO1of3YL3/NuDeQ7yanBGs88pMng2GGoQ/Dyxero\nBtpA4BdpazZ7HBJxn1zJzPsNVNEcicpJcv+Um/pZvxrKZTzsYXFEXeeVSB8lqeur\nIatGhsjHGwKBgQCFt+ZAwQE3wVoITGIM2JDcihgzItPcLxzGL6uJ8fwoRbtEYKKO\nV1U3I50H4++LYi1RYD+zgOc+vW64Uupk4OwhbLTJKVe7iS9RaTPxBg/2Rh7ERRDI\nzt7i9//JwAtDLu1N0Y72zzLPly8xhRGzd0bA9DYkwxryoMJ0kOrn4vtf9QKBgClM\nu5b7UcFyEErtihNXNX46XI8zcsuwnR3q3ksB6X3LFdTktURGPeKAzaJBfRwD6ZY7\nGYjMhM8QgZSlwsfAq8FQ/axH7OC2dO3P84MAToTUwqqDz5aS8ylTGMIc7RCtcVMu\ninpMecgFTzM1pCU/+bJ66nGk02wPpRVAQdYAkYqHAoGBAMng5k6okAqCeb1Jo/zH\nxrcEK7u3nIZzlpXH8hfydyKKf4h0X8lBdteisSplFQJvt3LJGfDKE5DnLFPT1wO0\njXJdvuu6hZmEKWtG76PpACMuZTcoX5NtvzkBmDvQ8pI2skimdKRPCbg7hb02zB24\n9iNL2BWAkLHgct2zK/e1L53u\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFMaMsPBHMYMMxWGH8bV\npZlfYVoI8UkD2zgGdzfqoiDI+tfofEebqf+na8j9SwuTDugGCDaRqN2mPrd5tADa\njNiXI79tL8G0FDB7FOQyZBDQuRG50aFE6phjlhgbv1j5RkQC+Jld7yI4neJJ36HJ\n07eSntgVzW98G4i4rH8VngsUN0YCNR4ExDlRcS8EC9bavwcoCflzcvoGO7kN/brC\nHpYINOWu88ReDGS2+2OH6rExUIHf+cCO4X5JiSC1awEOdYeUDhqpMKd7XyahoOxY\nCZk5ZrGAPDqhCqravxPwvC0VITNJhQIOb1NyVp7b0+wgGVzmAzHkGRyvTFROoFU3\n8QIDAQAB\n-----END PUBLIC KEY-----
CORS_ORIGINS=https://avatar-web-xxxxx.vercel.app,http://localhost:3000
AI_SERVICE_URL=https://avatar-ai-xxxxx.onrender.com
S3_BUCKET=avatar-platform
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
LIVEKIT_API_KEY=API2Z5vzpWgF9zj
LIVEKIT_API_SECRET=GfRGcHN0XcqGq6ae2qTG7n8aP7AmRUrunj8A3W3DJt5
LIVEKIT_URL=wss://aiavatar-kuold3h8.livekit.cloud
LTI_ISSUER=avatar-training-platform
INTERNAL_API_KEY=b228e9303116f0338d83adf92f634724a40d5c936d367284d6fbdc9fa8ebe11f
```

**IMPORTANT**: Update `AI_SERVICE_URL` with the AI service URL from Step 2. Replace `avatar-ai-xxxxx` with your actual Render service name.

3. Click **"Save"** and wait for deployment
4. Check logs for `Server running on port 4000`

**CAPTURE**: Copy the API service URL, e.g., `https://avatar-api-xxxxx.onrender.com`

### 3c. Run Database Migrations

Once the API is deployed, the database schema must be initialized.

1. In your local terminal:
```bash
cd apps/api
DATABASE_URL="postgresql://neondb_owner:npg_yJIe0Tk6MUvq@ep-floral-rain-amjx6wfo-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require" npx node-pg-migrate up
```

2. Check Neon dashboard to confirm tables are created

**If migrations fail**: Check that the Neon database URL is correct and you have network access.

---

## Step 4: Deploy Frontend to Vercel

### 4a. Import Repository

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Paste: `https://github.com/alphoder/AI-Agent.git`
4. Click **"Continue"**

### 4b. Configure Project

1. **Project Name**: `avatar-web`
2. **Framework**: `Next.js 14`
3. **Root Directory**: Toggle and select `apps/web`
4. Leave other settings as default
5. Click **"Continue"**

### 4c. Add Environment Variables

Before deploying, add:

```
NEXT_PUBLIC_API_URL=https://avatar-api-xxxxx.onrender.com/api
NEXT_PUBLIC_LIVEKIT_URL=wss://aiavatar-kuold3h8.livekit.cloud
```

Replace `avatar-api-xxxxx` with your actual API service name from Step 3.

5. Click **"Deploy"**

Wait 5-10 minutes for the build to complete. Check the **Deployments** tab for success.

**CAPTURE**: Copy the Vercel URL, e.g., `https://avatar-web-xxxxx.vercel.app`

---

## Step 5: Update API CORS Origins

Now that Vercel has assigned a URL, update the API's CORS settings.

1. Go to Render dashboard → **avatar-api** service
2. Go to **Settings** → **Environment Variables**
3. Update `CORS_ORIGINS` to:
```
https://avatar-web-xxxxx.vercel.app,http://localhost:3000
```

Replace `avatar-web-xxxxx` with your Vercel project name.

4. Click **"Save"** - the service will redeploy automatically

---

## Step 6: Smoke Test

### Test the Frontend

1. Visit: `https://avatar-web-xxxxx.vercel.app`
2. Login with:
   - **Email**: `admin@example.com` (or use SSO if configured)
   - **Password**: `password`
3. Navigate to Dashboard → Avatars
4. Confirm the page loads without console errors

### Test the API

```bash
# Check health
curl https://avatar-api-xxxxx.onrender.com/health

# Expected response:
{"status":"ok"}

# Check auth (should return 401)
curl https://avatar-api-xxxxx.onrender.com/api/avatars

# Expected response:
{"error":"Unauthorized"}
```

### Test the AI Service

```bash
curl https://avatar-ai-xxxxx.onrender.com/health/ready

# Expected response:
{"status":"ok"}
```

---

## Known Limitations

### Free Tier Constraints

- **Render free tier**: Services spin down after 15 mins of inactivity. First request may take 10-30 seconds.
- **Vercel free tier**: 100GB bandwidth/month, max 12 serverless functions
- **Neon free tier**: 3GB storage, limited to 3 branches
- **Upstash Redis free tier**: 10,000 commands/day
- **LiveKit Cloud free tier**: 2 hours/month concurrent time

### AI Service Size

The Python AI service with dependencies may exceed Render's free tier storage. If you get build errors:
- Consider upgrading to a paid Render plan
- Or switch to a lightweight LLM provider (currently using Groq, which is free)

### S3 Storage

The current `.env` points to local MinIO at `http://localhost:9000`. For production:
1. Replace with AWS S3 credentials and endpoint
2. Or deploy MinIO to a server and update the endpoint

---

## Environment Variables Reference

### Critical Secrets
Do NOT commit these. Always set in dashboard:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_PRIVATE_KEY`
- `JWT_PUBLIC_KEY`
- `GROQ_API_KEY`
- `DEEPGRAM_API_KEY`
- `OPENAI_API_KEY`
- `SIMLI_API_KEY`
- `HEYGEN_API_KEY`
- `PINECONE_API_KEY`
- `LIVEKIT_API_SECRET`
- `S3_SECRET_KEY`
- `INTERNAL_API_KEY`

### Safe to Commit
These can go in `.env.example` or `.env`:
- `NODE_ENV`
- `PORT`
- `LLM_PROVIDER`
- `TTS_PROVIDER`
- `PINECONE_INDEX`
- `S3_BUCKET`
- `S3_REGION`
- `LIVEKIT_API_KEY`
- `LIVEKIT_URL`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_LIVEKIT_URL`

---

## Rotate Keys (Monthly)

Every 30 days, regenerate secrets to maintain security:

1. **JWT Keys**:
```bash
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in private.pem -out public.pem
cat private.pem  # Copy to JWT_PRIVATE_KEY
cat public.pem   # Copy to JWT_PUBLIC_KEY
```

2. Update in **all 3 dashboards**:
   - Render (avatar-ai): `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`
   - Render (avatar-api): `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`
   - Vercel: No JWT keys needed (passed via NEXT_PUBLIC_API_URL)

3. **Regenerate INTERNAL_API_KEY**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Update in:
   - Render (avatar-ai): `INTERNAL_API_KEY`
   - Render (avatar-api): `INTERNAL_API_KEY`

4. **Rotate API Keys**:
   - Groq: https://console.groq.com/keys
   - Deepgram: https://console.deepgram.com/
   - Pinecone: https://app.pinecone.io/
   - LiveKit: https://dashboard.livekit.cloud/

---

## Troubleshooting

### Frontend fails to load
- Check `NEXT_PUBLIC_API_URL` points to correct API
- Check CORS headers: `https://avatar-web-xxxxx.vercel.app` is in API's `CORS_ORIGINS`
- Check browser console for 401 or CORS errors

### API service crashes after deploy
- Check Render logs for Python errors
- Verify `DATABASE_URL` is accessible from Render's network
- Verify all required env vars are set

### AI service timeouts
- Groq API may be rate-limited on free tier
- Check `GROQ_API_KEY` is valid
- Switch to `LLM_PROVIDER=openai` and verify `OPENAI_API_KEY`

### Database connection fails
- Verify Neon URL is correct in both `.env` and Render dashboards
- Check Neon project is not in "suspended" state
- Ensure database exists: `neondb`

---

## Next Steps

1. Monitor services in Render and Vercel dashboards
2. Set up error tracking (Sentry, etc.)
3. Configure email notifications for deploy failures
4. Plan for database scaling (Neon's free tier has limits)
5. Set up backups for customer data

---

## Support

For issues:
- **Render**: https://render.com/support
- **Vercel**: https://vercel.com/support
- **Neon**: https://neon.tech/docs
- **Upstash**: https://upstash.com/docs
- **LiveKit**: https://docs.livekit.io
