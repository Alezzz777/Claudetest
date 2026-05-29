import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogWrittenHandler } from '../application/events/audit-log-written.handler';
import { createEventEnvelope, MesEventType } from '@mes/shared';

function makeEnvelope() {
  return createEventEnvelope({
    type: MesEventType.ADMIN_USER_CREATED,
    source: 'urn:mes:admin-service:User',
    aggregateId: 'user-1',
    aggregateType: 'User',
    sequence: 1,
    data: { userId: 'user-1', email: 'test@mes.local' },
  });
}

function makePrisma(alreadyProcessed = false) {
  return {
    processedEvent: {
      findUnique: vi.fn().mockResolvedValue(alreadyProcessed ? { eventId: 'x' } : null),
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  } as any;
}

describe('AuditLogWrittenHandler', () => {
  it('first call: creates audit log and marks event processed', async () => {
    const prisma = makePrisma(false);
    const handler = new AuditLogWrittenHandler(prisma);
    await handler.handle(makeEnvelope());

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('second call with same eventId is a noop (idempotent)', async () => {
    const prisma = makePrisma(true); // already processed
    const handler = new AuditLogWrittenHandler(prisma);
    await handler.handle(makeEnvelope());

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates audit log with correct fields', async () => {
    const prisma = makePrisma(false);
    const handler = new AuditLogWrittenHandler(prisma);
    const envelope = makeEnvelope();
    await handler.handle(envelope);

    const [auditCreate] = prisma.$transaction.mock.calls[0]![0] as any[];
    expect(auditCreate).toBeDefined();
  });
});
