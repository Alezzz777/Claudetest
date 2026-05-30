import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaintenanceProjectionHandler } from '../application/events/equipment-runtime-updated.handler';
import { createEventEnvelope } from '../../../../../../packages/shared/src/events/event-envelope';
import {
  EQUIPMENT_CREATED_TYPE,
  EQUIPMENT_RUNTIME_UPDATED_TYPE,
  EQUIPMENT_DOWN_TYPE,
  EQUIPMENT_RESTORED_TYPE,
} from '../domain/equipment.aggregate';
import {
  WORK_ORDER_CREATED_TYPE,
  WORK_ORDER_STARTED_TYPE,
  WORK_ORDER_COMPLETED_TYPE,
  WORK_ORDER_CANCELLED_TYPE,
} from '../domain/work-order.aggregate';

function makePrisma() {
  return {
    processedEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    equipmentProjection: {
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    workOrderProjection: {
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeEnvelope(type: string, data: unknown, id = 'evt-1') {
  const env = createEventEnvelope({ type, source: 'test', aggregateId: 'agg-1', aggregateType: 'Test', sequence: 1, data });
  return { ...env, id };
}

describe('MaintenanceProjectionHandler', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let handler: MaintenanceProjectionHandler;

  beforeEach(() => {
    prisma = makePrisma();
    handler = new MaintenanceProjectionHandler(prisma as any);
  });

  it('handles maintenance.equipment.created', async () => {
    const envelope = makeEnvelope(EQUIPMENT_CREATED_TYPE, { equipmentId: 'eq-1', name: 'CNC-1', workCenterId: 'wc-1', maintenanceThresholdHours: 100, tenantId: 't-1' });
    await handler.handleIdempotent(envelope);
    expect(prisma.equipmentProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { equipmentId: 'eq-1' },
      create: expect.objectContaining({ status: 'AVAILABLE', name: 'CNC-1' }),
    }));
    expect(prisma.processedEvent.create).toHaveBeenCalled();
  });

  it('handles maintenance.equipment.runtime.updated', async () => {
    const envelope = makeEnvelope(EQUIPMENT_RUNTIME_UPDATED_TYPE, { equipmentId: 'eq-1', runtimeHours: 50 });
    await handler.handleIdempotent(envelope);
    expect(prisma.equipmentProjection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { equipmentId: 'eq-1' },
      data: expect.objectContaining({ runtimeHours: 50 }),
    }));
  });

  it('handles maintenance.equipment.down → UNDER_MAINTENANCE', async () => {
    const envelope = makeEnvelope(EQUIPMENT_DOWN_TYPE, { equipmentId: 'eq-1', workOrderId: 'wo-1' });
    await handler.handleIdempotent(envelope);
    expect(prisma.equipmentProjection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'UNDER_MAINTENANCE' }),
    }));
  });

  it('handles maintenance.equipment.restored → AVAILABLE', async () => {
    const envelope = makeEnvelope(EQUIPMENT_RESTORED_TYPE, { equipmentId: 'eq-1' });
    await handler.handleIdempotent(envelope);
    expect(prisma.equipmentProjection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'AVAILABLE', runtimeHours: 0 }),
    }));
  });

  it('handles maintenance.work-order.created', async () => {
    const envelope = makeEnvelope(WORK_ORDER_CREATED_TYPE, { workOrderId: 'wo-1', equipmentId: 'eq-1', workOrderNo: 'WO-001', type: 'CORRECTIVE', description: 'fix', createdBy: 'u-1' });
    await handler.handleIdempotent(envelope);
    expect(prisma.workOrderProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workOrderId: 'wo-1' },
      create: expect.objectContaining({ status: 'DRAFT' }),
    }));
  });

  it('handles maintenance.work-order.started', async () => {
    const envelope = makeEnvelope(WORK_ORDER_STARTED_TYPE, { workOrderId: 'wo-1', actualStart: new Date().toISOString() });
    await handler.handleIdempotent(envelope);
    expect(prisma.workOrderProjection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    }));
  });

  it('handles maintenance.work-order.completed', async () => {
    const envelope = makeEnvelope(WORK_ORDER_COMPLETED_TYPE, { workOrderId: 'wo-1', resolution: 'done', completedBy: 'u-1', actualEnd: new Date().toISOString() });
    await handler.handleIdempotent(envelope);
    expect(prisma.workOrderProjection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
  });

  it('handles maintenance.work-order.cancelled', async () => {
    const envelope = makeEnvelope(WORK_ORDER_CANCELLED_TYPE, { workOrderId: 'wo-1', reason: 'no more', cancelledBy: 'u-1' });
    await handler.handleIdempotent(envelope);
    expect(prisma.workOrderProjection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
  });

  it('skips duplicate events (idempotency)', async () => {
    prisma.processedEvent.findUnique = vi.fn().mockResolvedValue({ eventId: 'evt-1', processedAt: new Date() });
    const envelope = makeEnvelope(EQUIPMENT_DOWN_TYPE, { equipmentId: 'eq-1', workOrderId: 'wo-1' });
    await handler.handleIdempotent(envelope);
    expect(prisma.equipmentProjection.updateMany).not.toHaveBeenCalled();
    expect(prisma.processedEvent.create).not.toHaveBeenCalled();
  });
});
