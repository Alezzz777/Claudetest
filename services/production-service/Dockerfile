FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY services/production-service/package*.json ./services/production-service/
RUN npm ci --workspace=packages/shared --workspace=services/production-service

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY services/production-service ./services/production-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/production-service
RUN cd services/production-service && npx prisma generate

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/services/production-service/dist ./dist
COPY --from=builder /app/services/production-service/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
