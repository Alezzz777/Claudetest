import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogWrittenHandler } from '../application/events/audit-log-written.handler';
import type { EventEnvelope } from '@mes/shared';

function makeMockPrisma() {
  return {
    processedEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => {
      // Execute each operation (they are Prisma promises)
      for (const op of ops) {
        await (op as Promise<unknown>);
      }
    }),
  };
}

function makeEnvelope(id = 'evt-1'): EventEnvelope {
  return {
    id,
    specversion: '1.0',
    type: 'admin.user.created',
    source: 'urn:mes:admin-service:User',
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    schemaVersion: '1.0.0',
    correlationId: 'corr-1',
    aggregateId: 'agg-1',
    aggregateType: 'User',
    sequence: 1,
    data: {},
  };
}

describe('AuditLogWrittenHandler', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let handler: AuditLogWrittenHandler;

  beforeEach(() => {
    prisma = makeMockPrisma();
    handler = new AuditLogWrittenHandler(prisma as never);
  });

  it('first call with eventId → creates audit_log + processed_event', async () => {
    prisma.processedEvent.findUnique.mockResolvedValueOnce(null);
    prisma.auditLog.create.mockResolvedValueOnce({});
    prisma.processedEvent.create.mockResolvedValueOnce({});

    await handler.handle(makeEnvelope('evt-1'));

    expect(prisma.processedEvent.findUnique).toHaveBeenCalledWith({ where: { eventId: 'evt-1' } });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('second call with same eventId → no-op (already processed)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValueOnce({ eventId: 'evt-1', processedAt: new Date() });

    await handler.handle(makeEnvelope('evt-1'));

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
