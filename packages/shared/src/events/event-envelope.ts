import { v4 as uuidv4 } from 'uuid';

/**
 * CloudEvents 1.0 compatible event envelope with MES-specific extensions.
 * Every domain event is wrapped in this envelope before publishing to Kafka.
 *
 * Extensions beyond CloudEvents spec:
 *  - correlationId  — traces the originating business transaction (e.g. work order)
 *  - causationId    — direct parent event that caused this event
 *  - schemaVersion  — semantic version for the event payload schema
 *  - aggregateId    — the domain aggregate this event belongs to
 *  - aggregateType  — e.g. "ProductionOrder", "QualityPlan"
 *  - sequence       — monotonically increasing per aggregate (for optimistic concurrency)
 */
export interface EventEnvelope<T = unknown> {
  // ── CloudEvents required ──────────────────────────────────────────────────
  /** Unique event identifier (UUID v4) */
  id: string;
  /** Source of the event: urn:mes:{service}:{aggregateType} */
  source: string;
  /** CloudEvents spec version */
  specversion: '1.0';
  /** Event type name, e.g. "production.order.started" */
  type: string;
  /** ISO 8601 timestamp of when the event occurred */
  time: string;
  /** Media type of the data field */
  datacontenttype: 'application/json';
  /** Schema URI in Schema Registry */
  dataschema?: string;

  // ── MES extensions ────────────────────────────────────────────────────────
  /** Traces an end-to-end business transaction across services */
  correlationId: string;
  /** ID of the event that directly caused this event (for event chains) */
  causationId?: string;
  /** Semver of the payload schema, used by consumers to handle migrations */
  schemaVersion: string;
  /** The domain aggregate instance this event belongs to */
  aggregateId: string;
  /** Name of the aggregate type, e.g. "ProductionOrder" */
  aggregateType: string;
  /** Position of this event in the aggregate's event stream (1-based) */
  sequence: number;
  /** Tenant / site identifier for multi-site deployments */
  tenantId?: string;

  /** The domain event payload */
  data: T;
}

/**
 * Factory for creating event envelopes with sensible defaults.
 */
export function createEventEnvelope<T>(params: {
  type: string;
  source: string;
  aggregateId: string;
  aggregateType: string;
  sequence: number;
  data: T;
  schemaVersion?: string;
  correlationId?: string;
  causationId?: string;
  tenantId?: string;
  dataschema?: string;
}): EventEnvelope<T> {
  return {
    id: uuidv4(),
    specversion: '1.0',
    datacontenttype: 'application/json',
    time: new Date().toISOString(),
    schemaVersion: params.schemaVersion ?? '1.0.0',
    correlationId: params.correlationId ?? uuidv4(),
    type: params.type,
    source: params.source,
    aggregateId: params.aggregateId,
    aggregateType: params.aggregateType,
    sequence: params.sequence,
    data: params.data,
    ...(params.causationId !== undefined && { causationId: params.causationId }),
    ...(params.tenantId !== undefined && { tenantId: params.tenantId }),
    ...(params.dataschema !== undefined && { dataschema: params.dataschema }),
  };
}

/**
 * Extract the Kafka message key from an envelope.
 * Keyed by aggregateId ensures ordering within a partition.
 */
export function envelopeToKafkaKey(envelope: EventEnvelope): string {
  return `${envelope.aggregateType}:${envelope.aggregateId}`;
}
