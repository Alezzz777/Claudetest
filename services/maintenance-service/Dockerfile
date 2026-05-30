FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/ ./packages/

# Copy service files
COPY services/maintenance-service/ ./services/maintenance-service/

# Install all workspace deps from root
RUN npm install --ignore-scripts

# Generate Prisma client
WORKDIR /app/services/maintenance-service
RUN npx prisma generate

# Build
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services/maintenance-service/dist ./services/maintenance-service/dist
COPY --from=base /app/services/maintenance-service/prisma ./services/maintenance-service/prisma
COPY --from=base /app/services/maintenance-service/node_modules ./services/maintenance-service/node_modules
WORKDIR /app/services/maintenance-service
EXPOSE 3006
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
