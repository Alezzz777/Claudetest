FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/ ./packages/

# Copy service files
COPY services/inventory-service/ ./services/inventory-service/

# Install all workspace deps from root
RUN npm install --ignore-scripts

# Generate Prisma client
WORKDIR /app/services/inventory-service
RUN npx prisma generate

# Build
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services/inventory-service/dist ./services/inventory-service/dist
COPY --from=base /app/services/inventory-service/prisma ./services/inventory-service/prisma
COPY --from=base /app/services/inventory-service/node_modules ./services/inventory-service/node_modules
WORKDIR /app/services/inventory-service
EXPOSE 3005
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
