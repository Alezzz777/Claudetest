# MES Platform Architecture

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Enterprise Zone (L4)                         │
│   ERP (SAP / Oracle)                                              │
│      │ B2MML XML over HTTP/SFTP                                   │
└──────┼───────────────────────────────────────────────────────────┘
       │
┌──────▼───────────────────────────────────────────────────────────┐
│                        MES Zone (L3)                              │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  web-app    │  │   Keycloak   │  │   Schema Registry        │ │
│  │  React SPA  │  │  OAuth2/OIDC │  │   (Confluent)            │ │
│  └──────┬──────┘  └──────────────┘  └──────────────────────────┘ │
│         │  SSE / WebSocket                                        │
│  ┌──────▼──────────────────────────────────────────────────┐     │
│  │           Apache Kafka (Event Bus)                       │     │
│  │  Topics: production.*, quality.*, inventory.*, ...       │     │
│  │  Retention: 7 days | Replication: 3 | Partitions: 12    │     │
│  └──────────────────────────────────────────────────────────┘     │
│         │                                                         │
│  ┌──────┴──────────────────────────────────────────────┐         │
│  │              Domain Microservices                    │         │
│  │                                                      │         │
│  │  production-service   (port 3001)  PostgreSQL 5432   │         │
│  │  quality-service      (port 3002)  PostgreSQL 5433   │         │
│  │  maintenance-service  (port 3003)  PostgreSQL 5434   │         │
│  │  inventory-service    (port 3004)  PostgreSQL 5435   │         │
│  │  recipe-service       (port 3005)  PostgreSQL 5436   │         │
│  │  scheduling-service   (port 3006)  PostgreSQL 5437   │         │
│  │  integration-service  (port 3007)  PostgreSQL 5438   │         │
│  │  admin-service        (port 3008)  PostgreSQL 5439   │         │
│  └──────────────────────────────────────────────────────┘         │
│                                                                   │
│  Observability: OTel Collector → Prometheus → Grafana             │
└──────────────────────────────────────────────────────────────────┘
       │ MQTT Sparkplug B / OPC UA
┌──────▼───────────────────────────────────────────────────────────┐
│                        Edge Zone (L2)                             │
│                                                                   │
│  integration-service (edge mode)                                  │
│    ├── OPC UA client → PLC/SCADA servers                         │
│    ├── MQTT subscriber → Sparkplug B devices                      │
│    └── Local PostgreSQL buffer (offline resilience)               │
│                                                                   │
│  Eclipse Mosquitto MQTT broker (edge-local)                       │
└──────────────────────────────────────────────────────────────────┘
       │ Sparkplug B / OPC UA
┌──────▼───────────────────────────────────────────────────────────┐
│                    Field/Device Zone (L1/L0)                      │
│   PLCs, CNCs, Robots, Sensors, HMIs, SCADA systems               │
│   Protocols: OPC UA, Modbus TCP, PROFINET, Ethernet/IP            │
└──────────────────────────────────────────────────────────────────┘
```

## Core Architectural Patterns

### Event Sourcing

Applied to: production-service, quality-service, inventory-service

- All domain state changes are persisted as **immutable events** in `event_store` table
- Current state is rebuilt by **replaying** the event stream (`rehydrate()`)
- Enables: complete audit trail, time-travel queries, event replay for debugging
- Optimistic concurrency: `unique(aggregateId, sequence)` constraint prevents conflicts

### CQRS (Command Query Responsibility Segregation)

- **Write side**: Command handlers call aggregate, which produces events → saved to event store
- **Read side**: Query handlers read from materialized projection tables (denormalized, fast)
- Projections are updated by event handlers consuming from Kafka (eventual consistency)
- Read model is separate from write model — can be optimized independently

### Transactional Outbox Pattern

Prevents the "dual write problem" between DB and message broker:

```
Command Handler
  └── DB Transaction
        ├── INSERT INTO event_store (event data)
        └── INSERT INTO outbox (status=PENDING)

Outbox Relay (every 500ms)
  └── SELECT * FROM outbox WHERE status=PENDING
        ├── Publish to Kafka (idempotent producer)
        └── UPDATE outbox SET status=PUBLISHED
```

If Kafka is unavailable, events accumulate in outbox and are retried.
Max 5 attempts → DEAD_LETTER status for manual intervention.

### Saga Pattern (Distributed Transactions)

Used for multi-service business processes, e.g.:
- "Create Production Order" saga: production → inventory reservation → quality plan creation
- "Start Production Order" saga: validate recipe → allocate materials → notify work center

Each saga step:
1. Sends a command to a downstream service
2. Waits for a success/failure event
3. On failure: triggers compensating transactions in reverse order

Saga state persisted in `saga_instances` table — survives service restarts.

### Idempotent Event Handlers

Every Kafka consumer handler checks `processed_events` before processing:

```typescript
const already = await prisma.processedEvent.findUnique({ where: { eventId } });
if (already) return; // skip duplicate
// ... process event
await prisma.$transaction([
  // ... update projection
  prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
]);
```

This ensures Kafka's at-least-once delivery doesn't cause duplicate state mutations.

## Data Architecture Per Service

Each service has its own PostgreSQL database with these tables:

| Table | Purpose |
|-------|---------|
| `event_store` | Append-only event log (the source of truth) |
| `outbox` | Transactional outbox for Kafka publishing |
| `processed_events` | Idempotency key store |
| `*_projections` | Materialized read models (CQRS read side) |
| `saga_instances` | Saga state persistence |

## Security Architecture

- **Authentication**: Keycloak (OAuth 2.0 + OIDC)
- **Authorization**: JWT Bearer tokens with MES roles in claims
- **Roles**: OPERATOR, DISPATCHER, QUALITY_CONTROLLER, MAINTENANCE_TECH, ENGINEER, ADMIN, VIEWER
- **Scope**: Role can be scoped to GLOBAL / SITE / AREA
- **Service-to-service**: Keycloak client credentials flow (M2M tokens)

## Observability

```
Service → OpenTelemetry SDK → OTel Collector → Prometheus → Grafana
                                            └→ Jaeger (traces)
```

Metrics exposed at `/api/v1/metrics` (Prometheus format):
- Request rate, latency (p50/p95/p99)
- Event store write rate
- Outbox queue depth
- Kafka consumer lag
- OEE per work center

Traces use W3C TraceContext propagated via Kafka message headers.

## Edge Architecture

The `integration-service` can run in two modes:

**Cloud mode** (default): Connects directly to central Kafka, no local buffering.

**Edge mode** (`EDGE_MODE=true`): 
- Connects to local MQTT broker
- Buffers telemetry in local PostgreSQL if cloud is unreachable
- Flushes buffer to Kafka when connectivity is restored
- Supports offline operation for up to `EDGE_BUFFER_MAX_EVENTS` events

Edge-to-cloud bridge uses UNS (Unified Namespace) topic hierarchy per ISA-95.

## ISA-88 Recipe Model

```
General Recipe (product-agnostic)
  └── Site Recipe (plant-specific)
        └── Master Recipe (equipment-specific, versioned)
              └── Control Recipe (production instance)
```

Implemented in `recipe-service` with event-sourced version management.
Each recipe step has:
- Work center assignment
- Process parameters (nominal, lower limit, upper limit)
- Duration estimate
- Quality characteristic references

## Deployment Topology

### Development
```
docker compose up -d   # Kafka, PostgreSQL×8, Mosquitto, Keycloak, Grafana
npm run dev             # All services via ts-node-dev
```

### Production (Kubernetes)
```
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/configmap-common.yaml
helm install mes-platform infrastructure/helm/mes-services/ \
  --namespace mes-platform \
  --values infrastructure/helm/mes-services/values.yaml
```

### Edge
```
docker compose -f docker-compose.edge.yml up -d
```
