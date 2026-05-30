FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/ ./packages/

# Copy service files
COPY services/recipe-service/ ./services/recipe-service/

# Install all workspace deps from root
RUN npm install --ignore-scripts

# Generate Prisma client
WORKDIR /app/services/recipe-service
RUN npx prisma generate

# Build
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services/recipe-service/dist ./services/recipe-service/dist
COPY --from=base /app/services/recipe-service/prisma ./services/recipe-service/prisma
COPY --from=base /app/services/recipe-service/node_modules ./services/recipe-service/node_modules
WORKDIR /app/services/recipe-service
EXPOSE 3002
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
