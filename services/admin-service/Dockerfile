FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/ ./packages/

# Copy service files
COPY services/admin-service/ ./services/admin-service/

# Install all workspace deps from root
RUN npm install --ignore-scripts

# Generate Prisma client
WORKDIR /app/services/admin-service
RUN npx prisma generate

# Build
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services/admin-service/dist ./services/admin-service/dist
COPY --from=base /app/services/admin-service/prisma ./services/admin-service/prisma
COPY --from=base /app/services/admin-service/node_modules ./services/admin-service/node_modules
WORKDIR /app/services/admin-service
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
