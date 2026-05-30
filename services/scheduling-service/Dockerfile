FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/ ./packages/

# Copy service files
COPY services/scheduling-service/ ./services/scheduling-service/

# Install all workspace deps from root
RUN npm install --ignore-scripts

# Generate Prisma client
WORKDIR /app/services/scheduling-service
RUN npx prisma generate

# Build
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services/scheduling-service/dist ./services/scheduling-service/dist
COPY --from=base /app/services/scheduling-service/prisma ./services/scheduling-service/prisma
COPY --from=base /app/services/scheduling-service/node_modules ./services/scheduling-service/node_modules
WORKDIR /app/services/scheduling-service
EXPOSE 3007
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
