FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY services/inventory-service/package*.json ./services/inventory-service/
RUN npm ci --workspace=packages/shared --workspace=services/inventory-service

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY services/inventory-service ./services/inventory-service
RUN npm run build --workspace=packages/shared && npm run build --workspace=services/inventory-service
RUN cd services/inventory-service && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/services/inventory-service/dist ./dist
COPY --from=builder /app/services/inventory-service/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3004
CMD ["node", "dist/main.js"]
