FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/ ./packages/

# Copy service files
COPY services/integration-service/ ./services/integration-service/

# Install all workspace deps from root
RUN npm install --ignore-scripts

# Generate Prisma client
WORKDIR /app/services/integration-service
RUN npx prisma generate

# Build
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services/integration-service/dist ./services/integration-service/dist
COPY --from=base /app/services/integration-service/prisma ./services/integration-service/prisma
COPY --from=base /app/services/integration-service/node_modules ./services/integration-service/node_modules
WORKDIR /app/services/integration-service
EXPOSE 3008
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
