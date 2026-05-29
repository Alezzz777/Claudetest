FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY services/web-app/package*.json ./services/web-app/
RUN npm ci --workspace=services/web-app

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY services/web-app ./services/web-app
ARG VITE_API_GATEWAY_URL
ARG VITE_SSE_URL
ARG VITE_WS_URL
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
RUN npm run build --workspace=services/web-app

FROM nginx:alpine AS runtime
COPY --from=builder /app/services/web-app/dist /usr/share/nginx/html
COPY services/web-app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
