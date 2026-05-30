/**
 * Transactional Outbox pattern entity.
 *
 * The outbox guarantees at-least-once delivery to Kafka without distributed
 * transactions. The sequence is:
 *   1. Domain command handler writes aggregate event + outbox row in ONE DB transaction.
 *   2. Outbox relay (polling or CDC via Debezium) reads PENDING rows.
 *   3. Relay publishes to Kafka, then marks row PUBLISHED.
 *   4. If Kafka publish fails, row stays PENDING and will be retried.
 *
 * Schema mirrors the Prisma model defined in each service's prisma/schema.prisma.
 */
export interface OutboxEntry {
  /** Primary key — UUID v4 */
  id: string;
  /** CloudEvents "type" field, e.g. "production.order.started" */
  eventType: string;
  /** Aggregate type, e.g. "ProductionOrder" */
  aggregateType: string;
  /** Aggregate instance identifier */
  aggregateId: string;
  /** Full serialized EventEnvelope<T> as JSON */
  payload: Record<string, unknown>;
  /** Kafka topic to publish to (usually equals eventType) */
  topic: string;
  /** Kafka partition key (usually aggregateType:aggregateId) */
  partitionKey: string;
  /** Processing state */
  status: OutboxStatus;
  /** Number of publish attempts */
  attempts: number;
  /** UTC timestamp when the row was inserted */
  createdAt: Date;
  /** UTC timestamp when the row was last processed */
  processedAt: Date | null;
  /** Error message from last failed publish attempt */
  lastError: string | null;
}

export enum OutboxStatus {
  /** Waiting to be published */
  PENDING = 'PENDING',
  /** Successfully published to Kafka */
  PUBLISHED = 'PUBLISHED',
  /** Permanently failed after max retries */
  DEAD_LETTER = 'DEAD_LETTER',
}

/** Maximum publish attempts before moving to DEAD_LETTER */
export const OUTBOX_MAX_ATTEMPTS = 5;

/** Milliseconds between outbox relay polling cycles */
export const OUTBOX_POLL_INTERVAL_MS = 500;

/** Batch size for outbox relay per poll cycle */
export const OUTBOX_BATCH_SIZE = 100;
