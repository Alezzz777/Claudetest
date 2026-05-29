FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl python3 make g++

FROM base AS deps
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY services/integration-service/package*.json ./services/integration-service/
RUN npm ci --workspace=packages/shared --workspace=services/integration-service

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY services/integration-service ./services/integration-service
RUN npm run build --workspace=packages/shared && npm run build --workspace=services/integration-service
RUN cd services/integration-service && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/services/integration-service/dist ./dist
COPY --from=builder /app/services/integration-service/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3007
CMD ["node", "dist/main.js"]
