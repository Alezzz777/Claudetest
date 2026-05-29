FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY services/quality-service/package*.json ./services/quality-service/
RUN npm ci --workspace=packages/shared --workspace=services/quality-service

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY services/quality-service ./services/quality-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=services/quality-service
RUN cd services/quality-service && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/services/quality-service/dist ./dist
COPY --from=builder /app/services/quality-service/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3002
CMD ["node", "dist/main.js"]
