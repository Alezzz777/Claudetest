# API Contracts

## REST APIs (OpenAPI 3.1)

Each NestJS service exposes a Swagger UI at `/api/v1/docs` and a machine-readable OpenAPI JSON at `/api/v1/docs-json`.

| Service | Local URL | Description |
|---------|-----------|-------------|
| production-service | http://localhost:3001/api/v1/docs | Production orders, operations, OEE |
| quality-service | http://localhost:3002/api/v1/docs | Quality plans, measurements, NCR |
| maintenance-service | http://localhost:3003/api/v1/docs | Work orders, equipment runtime |
| inventory-service | http://localhost:3004/api/v1/docs | Lots, movements, reservations |
| recipe-service | http://localhost:3005/api/v1/docs | Recipes, versioning |
| scheduling-service | http://localhost:3006/api/v1/docs | Schedule, entries |
| integration-service | http://localhost:3007/api/v1/docs | Devices, B2MML endpoint |
| admin-service | http://localhost:3008/api/v1/docs | Users, roles, audit |

### Authentication

All REST endpoints require a Bearer JWT issued by Keycloak:

```http
Authorization: Bearer <access_token>
```

Obtain tokens from:
```
POST http://localhost:8080/realms/mes/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&client_id=mes-web-app&username=operator1&password=secret
```

### Key REST Endpoints

#### Production Service

```
GET  /api/v1/production-orders/:orderId
POST /api/v1/production-orders/:orderId/start
POST /api/v1/production-orders/:orderId/pause
POST /api/v1/production-orders/:orderId/complete
```

#### Quality Service

```
GET  /api/v1/quality-plans/:orderId/results
POST /api/v1/quality-plans/:planId/measurements
GET  /api/v1/ncrs?status=OPEN
```

#### Maintenance Service

```
GET  /api/v1/equipment/:equipmentId/status
POST /api/v1/equipment/:equipmentId/work-orders
GET  /api/v1/work-orders?status=OPEN
```

#### Inventory Service

```
GET  /api/v1/lots/:lotId
POST /api/v1/lots/:lotId/move
POST /api/v1/lots/:lotId/consume
```

#### Integration Service

```
GET  /api/v1/integration/devices/:deviceId/status
POST /api/v1/integration/erp/b2mml/production-schedule
```

---

## Event Bus (AsyncAPI 3.0)

The event bus uses Apache Kafka with topics named after the event type.

**AsyncAPI document** will be auto-generated from event type definitions and published at:
```
http://localhost:8090/topics  (Kafka UI)
http://localhost:8081/subjects  (Schema Registry)
```

### Topic naming convention

```
<domain>.<aggregate>.<verb>
```

Examples:
- `production.order.started`
- `quality.ncr.raised`
- `integration.telemetry.received`

### Message format

All messages are JSON-serialized `EventEnvelope<T>` — see `packages/shared/src/events/event-envelope.ts`.

Kafka message key format: `{AggregateType}:{aggregateId}`
This ensures ordering within an aggregate's event stream.

---

## UNS (Unified Namespace) — MQTT Topic Hierarchy

```
spBv1.0/<group_id>/<message_type>/<edge_node_id>/<device_id>
```

ISA-95 Level mapping:
```
Enterprise  → group_id prefix (e.g. "acme-plant-01")
Site/Area   → group_id (e.g. "plant-01-assembly")
Line/Cell   → edge_node_id (e.g. "line-A-cell-1")
Device      → device_id (e.g. "plc-001")
Variable    → metric name within DDATA payload
```

Full UNS path example:
```
acme-corp/plant-01/assembly/line-A/cell-1/plc-001/run-hours
```

---

## gRPC (protobuf)

gRPC is used for synchronous service-to-service calls where request-response
latency is critical (e.g., recipe-service → production-service for recipe lookup).

Proto files location: `packages/shared/proto/`  
_(To be added: recipe.proto, production.proto)_

---

## B2MML (ISA-95 XML)

ERP integration uses WBF/ISA-95 B2MML V0600 XML schemas.

Inbound (ERP → MES):
- `ProductionSchedule` — production orders
- `MaterialRequirements` — BOM allocations

Outbound (MES → ERP):
- `ProductionPerformance` — actuals
- `QualityTestResults` — quality data

Endpoint:
```
POST /api/v1/integration/erp/b2mml/production-schedule
Content-Type: application/xml
```
