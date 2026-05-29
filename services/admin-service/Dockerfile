FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl
FROM base AS deps
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY services/admin-service/package*.json ./services/admin-service/
RUN npm ci --workspace=packages/shared --workspace=services/admin-service
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY services/admin-service ./services/admin-service
RUN npm run build --workspace=packages/shared && npm run build --workspace=services/admin-service
RUN cd services/admin-service && npx prisma generate
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/services/admin-service/dist ./dist
COPY --from=builder /app/services/admin-service/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3008
CMD ["node", "dist/main.js"]
