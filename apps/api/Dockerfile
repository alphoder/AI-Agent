# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:25-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM node:25-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

RUN corepack enable pnpm && \
    pnpm --filter @avatar-platform/shared build && \
    pnpm --filter @avatar-platform/api build

# ============================================
# Stage 3: Production
# ============================================
FROM node:25-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:appgroup /app/apps/api/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/apps/api/package.json ./
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/packages/shared/dist ./node_modules/@avatar-platform/shared/dist
COPY --from=builder --chown=appuser:appgroup /app/packages/shared/package.json ./node_modules/@avatar-platform/shared/

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
