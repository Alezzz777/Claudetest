# MES Event Catalog

All domain events use the CloudEvents-compatible `EventEnvelope<T>` defined in `packages/shared/src/events/event-envelope.ts`.

## Envelope Schema

```typescript
interface EventEnvelope<T> {
  // CloudEvents 1.0 required fields
  id: string;            // UUID v4 — unique event identifier
  source: string;        // urn:mes:{service}:{aggregateType}
  specversion: "1.0";
  type: string;          // See MesEventType enum
  time: string;          // ISO 8601
  datacontenttype: "application/json";
  dataschema?: string;   // Schema Registry URL

  // MES extensions
  correlationId: string; // Business transaction trace ID
  causationId?: string;  // Direct parent event ID
  schemaVersion: string; // Payload schema semver
  aggregateId: string;   // Domain aggregate instance ID
  aggregateType: string; // e.g. "ProductionOrder"
  sequence: number;      // Position in aggregate's event stream (1-based)
  tenantId?: string;     // Multi-site support

  data: T;               // Domain-specific payload
}
```

---

## Production Domain Events

### `production.order.created`
**Aggregate**: ProductionOrder  
**Source**: `urn:mes:production-service:ProductionOrder`

| Field | Type | Description |
|-------|------|-------------|
| orderId | string (UUID) | New order identifier |
| orderNo | string | Human-readable order number |
| recipeId | string | Recipe to execute |
| recipeVersion | string | Semver of recipe |
| plannedQty | number | Target production quantity |
| uom | string | Unit of measure (EA, KG, L…) |
| scheduledStartAt | ISO 8601 | Planned start time |
| scheduledEndAt | ISO 8601 | Planned end time |
| workCenterId | string | Target work center |
| tenantId | string | Site/tenant identifier |

### `production.order.released`
Order transitioned from DRAFT to RELEASED — ready for operator to start.

### `production.order.started`
| Field | Type | Description |
|-------|------|-------------|
| orderId | string | Order identifier |
| startedAt | ISO 8601 | Actual start time |
| operatorId | string | Operator who started |

### `production.order.paused` / `.completed` / `.cancelled`
Contains `orderId`, `reason`, `operatorId`, and `timestamp`.

### `production.operation.completed`
| Field | Type | Description |
|-------|------|-------------|
| orderId | string | Parent order |
| operationId | string | Operation identifier |
| operationNo | number | Sequence number |
| completedQty | number | Good quantity produced |
| scrapQty | number | Scrapped quantity |
| operatorId | string | |
| completedAt | ISO 8601 | |

### `production.oee.measured`
| Field | Type | Description |
|-------|------|-------------|
| orderId | string | |
| workCenterId | string | |
| availability | number | 0.0–1.0 |
| performance | number | 0.0–1.0 |
| quality | number | 0.0–1.0 |
| oee | number | availability × performance × quality |
| measuredAt | ISO 8601 | |

### `production.genealogy.linked`
Links a produced lot to its input materials for full traceability.

---

## Quality Domain Events

### `quality.plan.created`
Creates a new quality inspection plan linked to an order and recipe.

### `quality.measurement.recorded`
| Field | Type | Description |
|-------|------|-------------|
| planId | string | Quality plan ID |
| orderId | string | Production order |
| measurementId | string | UUID |
| characteristicId | string | Quality characteristic |
| actualValue | number | Measured value |
| lowerLimit | number | LSL |
| upperLimit | number | USL |
| uom | string | |
| result | `PASS\|FAIL\|CONDITIONAL` | |
| operatorId | string | |
| measuredAt | ISO 8601 | |

### `quality.ncr.raised`
Auto-raised when a measurement fails. Severity: MINOR / MAJOR / CRITICAL.

### `quality.hold.placed` / `quality.hold.released`
Placed on a lot when NCR raised; released after disposition.

---

## Maintenance Domain Events

### `maintenance.equipment.runtime-updated`
| Field | Type | Description |
|-------|------|-------------|
| equipmentId | string | |
| cumulativeRuntimeHours | number | Total hours since install |
| cycleCount | number | Total operation cycles |
| source | `OPC_UA\|MANUAL\|SPARKPLUG` | Data source |
| lastUpdatedAt | ISO 8601 | |

### `maintenance.work-order.created`
| Field | Type | Description |
|-------|------|-------------|
| workOrderId | string | UUID |
| equipmentId | string | Target equipment |
| workOrderType | `CORRECTIVE\|PREVENTIVE\|PREDICTIVE` | |
| priority | number | 1 (highest) – 5 (lowest) |
| plannedStartAt | ISO 8601 | |

### `maintenance.equipment.failed`
Equipment has failed — triggers corrective work order creation saga.

---

## Inventory Domain Events

### `inventory.lot.created`
New WIP material lot entered the system.

### `inventory.lot.moved`
| Field | Type | Description |
|-------|------|-------------|
| lotId | string | |
| fromLocationId | string | |
| toLocationId | string | |
| quantity | number | Moved quantity |
| reason | string | e.g. "Staged for assembly" |

### `inventory.lot.consumed`
Material consumed by a production operation. Records remaining quantity.

### `inventory.lot.scrapped`
Material scrapped with reason code.

### `inventory.reservation.created` / `.fulfilled` / `.cancelled`
Material reservation lifecycle for production orders.

---

## Recipe Domain Events

### `recipe.recipe.version-published`
| Field | Type | Description |
|-------|------|-------------|
| recipeId | string | Master recipe ID |
| version | string | Semver e.g. "2.1.0" |
| productCode | string | |
| steps | RecipeStep[] | ISA-88 procedure steps |
| publishedBy | string | |
| publishedAt | ISO 8601 | |

### `recipe.recipe.approved`
Recipe version approved for production use (requires quality sign-off).

### `recipe.recipe.obsoleted`
Recipe version superseded — no new orders allowed.

---

## Scheduling Domain Events

### `scheduling.schedule.created` / `.published`
Schedule lifecycle events.

### `scheduling.schedule.order-inserted`
Order added to the production schedule with time slot allocation.

### `scheduling.schedule.replanned`
Schedule re-optimized due to equipment failure, order cancellation or priority change.

---

## Integration Domain Events

### `integration.device.online` / `.offline`
Edge device connectivity status changes.

### `integration.telemetry.received`
| Field | Type | Description |
|-------|------|-------------|
| equipmentId | string | |
| nodeId / metric | string | OPC UA NodeId or Sparkplug metric name |
| value | any | Sensor reading |
| dataType | string | Float, Int, Bool, String |
| unsPath | string | ISA-95 UNS: enterprise/site/area/line/cell/device/variable |
| timestamp | ISO 8601 | Source timestamp |
| protocol | `OPC_UA\|SPARKPLUG_B\|MANUAL` | |

### `integration.erp.order-received`
Production order received from ERP via B2MML. Triggers saga to create MES order.

---

## Admin Domain Events

### `admin.user.created` / `admin.user.role-assigned`
User lifecycle and RBAC changes.

### `admin.audit.log-written`
Cross-service audit record written to the immutable audit trail.
