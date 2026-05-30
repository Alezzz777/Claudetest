# Railway Environment Variables

## Shared across all NestJS services

| Variable | Source | Example |
|---|---|---|
| `DATABASE_URL` | Railway PostgreSQL plugin (auto-injected) | `postgresql://...` |
| `KAFKA_BROKERS` | Upstash Kafka (auto-injected) | `host:9092` |
| `KAFKA_USERNAME` | Upstash Kafka | `username` |
| `KAFKA_PASSWORD` | Upstash Kafka | `password` |
| `KAFKA_SASL_MECHANISM` | Set manually | `scram-sha-256` |
| `KAFKA_SSL` | Set manually | `true` |
| `NODE_ENV` | Set manually | `production` |
| `PORT` | Railway auto-injects | `3001` |

## Keycloak service

Deploy from image: `quay.io/keycloak/keycloak:24`
Start command: `start --optimized`

| Variable | Value |
|---|---|
| `KEYCLOAK_ADMIN` | `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | (set a strong password) |
| `KC_DB` | `postgres` |
| `KC_DB_URL` | Railway PostgreSQL URL for Keycloak |
| `KC_HOSTNAME` | Your Railway Keycloak public URL |
| `KC_HTTP_ENABLED` | `true` |
| `KC_PROXY` | `edge` |

After Keycloak deploys: import `infrastructure/keycloak/realm-mes.json` via Admin Console.

## admin-service specific
| Variable | Value |
|---|---|
| `KEYCLOAK_URL` | Keycloak Railway public URL |
| `KEYCLOAK_REALM` | `mes` |
| `KEYCLOAK_CLIENT_ID` | `mes-services` |
| `KEYCLOAK_CLIENT_SECRET` | From Keycloak client credentials |

## integration-service specific
| Variable | Value |
|---|---|
| `OPCUA_ENDPOINT` | Your OPC UA server URL (optional) |
| `MQTT_BROKER_URL` | Your MQTT broker URL (optional) |
| `EDGE_MODE` | `false` |

## web-app (build-time ARGs)
| Variable | Value |
|---|---|
| `VITE_API_GATEWAY_URL` | Set to Railway public URL of whichever service acts as gateway, OR use individual service URLs |
| `VITE_KEYCLOAK_URL` | Keycloak Railway public URL |
| `VITE_KEYCLOAK_REALM` | `mes` |
| `VITE_KEYCLOAK_CLIENT_ID` | `mes-frontend` |

## Deployment order
1. Deploy PostgreSQL plugins for all services (Railway auto-creates DATABASE_URL)
2. Deploy Upstash Kafka add-on → copy KAFKA_* vars to all services
3. Deploy Keycloak service → set KC_* vars
4. Deploy all NestJS services (they auto-run prisma migrate deploy on start)
5. Deploy web-app last (needs all service URLs for VITE_ vars)

## Cost estimate (Railway Hobby $5/mo)
- 8 NestJS services: ~$0.50-1.00/each (depends on usage)
- 8 PostgreSQL databases: ~$0 (included in Hobby)
- Upstash Kafka: Free tier (10k messages/day) or $10/mo
- Total: ~$15-25/mo for a demo/staging setup
