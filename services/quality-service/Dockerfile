FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/ ./packages/

# Copy service files
COPY services/quality-service/ ./services/quality-service/

# Install all workspace deps from root
RUN npm install --ignore-scripts

# Generate Prisma client
WORKDIR /app/services/quality-service
RUN npx prisma generate

# Build
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services/quality-service/dist ./services/quality-service/dist
COPY --from=base /app/services/quality-service/prisma ./services/quality-service/prisma
COPY --from=base /app/services/quality-service/node_modules ./services/quality-service/node_modules
WORKDIR /app/services/quality-service
EXPOSE 3004
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
