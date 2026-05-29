# Decentralized Event-Driven MES (Manufacturing Execution System)

A production-grade Manufacturing Execution System built on event-driven microservices architecture, following ISA-88/ISA-95 standards, with full Event Sourcing, CQRS, Saga pattern, and Unified Namespace (UNS) for industrial IoT integration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Enterprise Zone (L4)                          │
│  ERP System ──── B2MML ──── integration-service                     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                        MES Zone (L3)                                 │
│                                                                      │
│  web-app (React SPA)   Keycloak (OAuth2/OIDC)   Schema Registry     │
│                │                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Apache Kafka (Event Bus)                   │   │
│  │  Topics: production.*, quality.*, inventory.*, ...           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                            │
│  production-service, quality-service, maintenance-service, ...      │
│  Each service: PostgreSQL + Event Store + Outbox + Projections       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                        Edge Zone (L2)                                │
│  integration-service edge agent                                      │
│  OPC UA Adapter | MQTT/Sparkplug Adapter | Local PG Buffer           │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                      Field/Device Zone (L1/L0)                       │
│  PLCs, SCADA, Sensors, HMIs - via OPC UA / MQTT Sparkplug B/D       │
└─────────────────────────────────────────────────────────────────────┘
```

## Domain Services

| Service | Code | Responsibility |
|---------|------|----------------|
| `production-service` | PS-PR | Production orders, operations, OEE, genealogy |
| `quality-service` | PS-QC | Quality plans, measurements, non-conformances (NCR) |
| `maintenance-service` | PS-MN | Equipment runtime, work orders, PM scheduling |
| `inventory-service` | PS-IN | WIP materials, lot tracking, reservations, movements |
| `recipe-service` | PS-RC | Product specifications, recipes, versioning per ISA-88 |
| `scheduling-service` | PS-SC | Production schedule, capacity planning, re-planning |
| `integration-service` | PS-IT | OPC UA, MQTT/Sparkplug, ERP/B2MML adapters |
| `admin-service` | PS-AD | Users, RBAC, schema registry, audit log |
| `web-app` | PS-UI | React SPA, real-time dashboard, operator screens |

## Cross-Cutting Patterns

- **Event Sourcing** - all domain state changes persisted as immutable events (production, quality, inventory)
- **CQRS** - commands write to event stream; queries served from materialized projections
- **Saga + Transactional Outbox** - distributed consistency without 2PC; events written to outbox in same DB transaction
- **Idempotent Event Handlers** - `idempotency_key` prevents duplicate processing on replay
- **Unified Namespace (UNS)** - ISA-95 compliant topic hierarchy: `enterprise/site/area/line/cell/device`
- **CloudEvents envelope** - standard envelope with correlationId, causationId, schemaVersion

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Run database migrations for all services
npm run migrate:all

# 4. Run all services in development
npm run dev

# 5. Open web app
open http://localhost:3000

# Keycloak admin: http://localhost:8080  (admin/admin)
# Kafka UI: http://localhost:8090
# Grafana: http://localhost:3001  (admin/admin)
```

## Technology Stack

- **Runtime**: Node.js LTS + TypeScript 5.x
- **Framework**: NestJS 10.x (domain services)
- **Frontend**: React 18 + TypeScript + Vite
- **Message Bus**: Apache Kafka + Schema Registry
- **Field Bus**: MQTT + Eclipse Mosquitto + Sparkplug B
- **Database**: PostgreSQL 16 (per-service)
- **ORM**: Prisma 5.x
- **Auth**: Keycloak + OAuth 2.0 / OIDC
- **Observability**: OpenTelemetry + Prometheus + Grafana
- **Container**: Docker + Kubernetes + Helm
- **API**: OpenAPI 3.1, AsyncAPI 3.0, gRPC (protobuf)

## Repository Layout

```
.
├── docs/                        # Architecture, API contracts, event catalog
├── infrastructure/              # Helm charts, K8s manifests
├── kubernetes/                  # Base K8s manifests (namespace, configmaps)
├── packages/
│   └── shared/                  # Shared TypeScript library (events, outbox, saga)
├── services/
│   ├── production-service/      # PS-PR
│   ├── quality-service/         # PS-QC
│   ├── maintenance-service/     # PS-MN
│   ├── inventory-service/       # PS-IN
│   ├── recipe-service/          # PS-RC
│   ├── scheduling-service/      # PS-SC
│   ├── integration-service/     # PS-IT
│   ├── admin-service/           # PS-AD
│   └── web-app/                 # PS-UI
├── docker-compose.yml           # Local dev infrastructure
├── docker-compose.edge.yml      # Edge node setup
├── package.json                 # npm workspaces root
└── tsconfig.base.json
```

## License

Proprietary - Manufacturing Systems Division
