FROM node:20-alpine AS build
WORKDIR /app
COPY services/web-app/package.json services/web-app/package-lock.json* ./
RUN npm install
COPY services/web-app/ .
ARG VITE_API_GATEWAY_URL
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
RUN npm run build

FROM node:20-alpine
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
