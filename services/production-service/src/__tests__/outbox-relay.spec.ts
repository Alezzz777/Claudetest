import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxPublisher } from '../infrastructure/persistence/outbox.publisher';
import { OutboxStatus, OUTBOX_MAX_ATTEMPTS } from '@mes/shared';

// ── Minimal stubs ──────────────────────────────────────────────────────────────

type OutboxRow = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  topic: string;
  partitionKey: string;
  status: OutboxStatus;
  attempts: number;
  createdAt: Date;
  processedAt: Date | null;
  lastError: string | null;
};

function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 'row-001',
    eventType: 'production.order.created',
    aggregateType: 'ProductionOrder',
    aggregateId: 'order-001',
    payload: { orderId: 'order-001' },
    topic: 'mes.production.orders',
    partitionKey: 'ProductionOrder:order-001',
    status: OutboxStatus.PENDING,
    attempts: 0,
    createdAt: new Date(),
    processedAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeMocks(rows: OutboxRow[]) {
  const updates: Array<{ id: string; data: Partial<OutboxRow> }> = [];

  const prisma = {
    outbox: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockImplementation(
        ({ where, data }: { where: { id: string }; data: Partial<OutboxRow> }) => {
          updates.push({ id: where.id, data });
          return Promise.resolve({ ...rows.find((r) => r.id === where.id), ...data });
        },
      ),
    },
  };

  const kafka = {
    publish: vi.fn().mockResolvedValue(undefined),
  };

  return { prisma, kafka, updates };
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('OutboxPublisher.relay()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes PENDING rows to Kafka and marks them PUBLISHED', async () => {
    const rows = [makeRow(), makeRow({ id: 'row-002', aggregateId: 'order-002' })];
    const { prisma, kafka, updates } = makeMocks(rows);

    const publisher = new OutboxPublisher(
      prisma as unknown as import('../infrastructure/persistence/prisma.service').PrismaService,
      kafka as unknown as import('../infrastructure/messaging/kafka-producer.service').KafkaProducerService,
    );
    await publisher.relay();

    expect(kafka.publish).toHaveBeenCalledTimes(2);
    expect(updates.filter((u) => u.data.status === OutboxStatus.PUBLISHED)).toHaveLength(2);
    for (const u of updates.filter((u) => u.data.status === OutboxStatus.PUBLISHED)) {
      expect(u.data.processedAt).toBeInstanceOf(Date);
    }
  });

  it('passes correct topic, key and value to Kafka producer', async () => {
    const row = makeRow();
    const { prisma, kafka } = makeMocks([row]);

    const publisher = new OutboxPublisher(
      prisma as unknown as import('../infrastructure/persistence/prisma.service').PrismaService,
      kafka as unknown as import('../infrastructure/messaging/kafka-producer.service').KafkaProducerService,
    );
    await publisher.relay();

    expect(kafka.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: row.topic,
        key: row.partitionKey,
        value: JSON.stringify(row.payload),
      }),
    );
  });

  it('increments attempts and leaves row PENDING on Kafka failure', async () => {
    const row = makeRow();
    const { prisma, kafka, updates } = makeMocks([row]);
    kafka.publish.mockRejectedValueOnce(new Error('Kafka unavailable'));

    const publisher = new OutboxPublisher(
      prisma as unknown as import('../infrastructure/persistence/prisma.service').PrismaService,
      kafka as unknown as import('../infrastructure/messaging/kafka-producer.service').KafkaProducerService,
    );
    await publisher.relay();

    expect(updates).toHaveLength(1);
    expect(updates[0]?.data.attempts).toBe(1);
    expect(updates[0]?.data.status).toBe(OutboxStatus.PENDING);
    expect(updates[0]?.data.lastError).toContain('Kafka unavailable');
  });

  it('marks row as DEAD_LETTER after OUTBOX_MAX_ATTEMPTS failures', async () => {
    const row = makeRow({ attempts: OUTBOX_MAX_ATTEMPTS - 1 });
    const { prisma, kafka, updates } = makeMocks([row]);
    kafka.publish.mockRejectedValueOnce(new Error('permanent failure'));

    const publisher = new OutboxPublisher(
      prisma as unknown as import('../infrastructure/persistence/prisma.service').PrismaService,
      kafka as unknown as import('../infrastructure/messaging/kafka-producer.service').KafkaProducerService,
    );
    await publisher.relay();

    expect(updates[0]?.data.status).toBe(OutboxStatus.DEAD_LETTER);
    expect(updates[0]?.data.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });

  it('does nothing when there are no PENDING rows', async () => {
    const { prisma, kafka } = makeMocks([]);

    const publisher = new OutboxPublisher(
      prisma as unknown as import('../infrastructure/persistence/prisma.service').PrismaService,
      kafka as unknown as import('../infrastructure/messaging/kafka-producer.service').KafkaProducerService,
    );
    await publisher.relay();

    expect(kafka.publish).not.toHaveBeenCalled();
    expect(prisma.outbox.update).not.toHaveBeenCalled();
  });

  it('prevents overlapping runs via isRunning guard', async () => {
    let resolveFirst!: () => void;
    const firstCallPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const row = makeRow();
    const { prisma, kafka } = makeMocks([row]);

    // Make the first kafka.publish hang until we release it
    let publishCallCount = 0;
    kafka.publish.mockImplementation(() => {
      publishCallCount++;
      return firstCallPromise;
    });

    const publisher = new OutboxPublisher(
      prisma as unknown as import('../infrastructure/persistence/prisma.service').PrismaService,
      kafka as unknown as import('../infrastructure/messaging/kafka-producer.service').KafkaProducerService,
    );

    // Start first relay — it will hang inside kafka.publish
    const first = publisher.relay();
    // Start second relay immediately — should be a no-op
    const second = publisher.relay();

    await second; // second completes immediately (guarded)
    resolveFirst(); // unblock first
    await first;

    // Only one publish call should have been made
    expect(publishCallCount).toBe(1);
  });
});
