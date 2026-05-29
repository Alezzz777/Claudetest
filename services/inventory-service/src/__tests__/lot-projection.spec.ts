import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LotProjectionHandler } from '../application/events/lot-moved.handler';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import type { LotCreatedPayload, LotMovedPayload, LotReservedPayload, LotReleasedPayload } from '../domain/material-lot.aggregate';

const makePrisma = () => {
  const processedEvents = new Map<string, boolean>();
  const lots = new Map<string, Record<string, unknown>>();

  return {
    processedEvent: {
      findUnique: vi.fn(({ where }: { where: { eventId: string } }) =>
        Promise.resolve(processedEvents.has(where.eventId) ? { eventId: where.eventId } : null),
      ),
      create: vi.fn(({ data }: { data: { eventId: string } }) => {
        processedEvents.set(data.eventId, true);
        return Promise.resolve(data);
      }),
    },
    lotProjection: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        lots.set(data['lotId'] as string, data);
        return Promise.resolve(data);
      }),
      update: vi.fn(({ where, data }: { where: { lotId: string }; data: Record<string, unknown> }) => {
        const existing = lots.get(where.lotId) ?? {};
        const updated = { ...existing, ...data };
        lots.set(where.lotId, updated);
        return Promise.resolve(updated);
      }),
      findUnique: vi.fn(({ where }: { where: { lotId: string } }) =>
        Promise.resolve(lots.get(where.lotId) ?? null),
      ),
    },
    wipProjection: {
      upsert: vi.fn(() => Promise.resolve({})),
    },
  };
};

describe('LotProjectionHandler', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let handler: LotProjectionHandler;

  beforeEach(() => {
    prisma = makePrisma();
    handler = new LotProjectionHandler(prisma as never);
  });

  it('INVENTORY_LOT_CREATED creates LotProjection', async () => {
    const payload: LotCreatedPayload = {
      lotId: 'lot-1',
      lotNo: 'LOT-001',
      materialCode: 'MAT-A',
      quantity: 100,
      locationId: 'LOC-1',
      tenantId: 'TENANT-1',
      createdAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.INVENTORY_LOT_CREATED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: 'lot-1',
      aggregateType: 'MaterialLot',
      sequence: 1,
      data: payload,
    });

    await handler.handleIdempotent(event);
    expect(prisma.lotProjection.create).toHaveBeenCalledOnce();
  });

  it('INVENTORY_LOT_MOVED updates locationId and status', async () => {
    // First create the lot
    const createPayload: LotCreatedPayload = {
      lotId: 'lot-1',
      lotNo: 'LOT-001',
      materialCode: 'MAT-A',
      quantity: 100,
      locationId: 'LOC-1',
      tenantId: 'TENANT-1',
      createdAt: new Date().toISOString(),
    };
    await handler.handleIdempotent(
      createEventEnvelope({
        type: MesEventType.INVENTORY_LOT_CREATED,
        source: 'urn:mes:inventory-service:MaterialLot',
        aggregateId: 'lot-1',
        aggregateType: 'MaterialLot',
        sequence: 1,
        data: createPayload,
      }),
    );

    const movedPayload: LotMovedPayload = {
      lotId: 'lot-1',
      fromLocationId: 'LOC-1',
      toLocationId: 'LOC-2',
      movedBy: 'USER-1',
      movedAt: new Date().toISOString(),
    };
    await handler.handleIdempotent(
      createEventEnvelope({
        type: MesEventType.INVENTORY_LOT_MOVED,
        source: 'urn:mes:inventory-service:MaterialLot',
        aggregateId: 'lot-1',
        aggregateType: 'MaterialLot',
        sequence: 2,
        data: movedPayload,
      }),
    );
    expect(prisma.lotProjection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locationId: 'LOC-2', status: 'MOVED' }) }),
    );
  });

  it('duplicate events are skipped (idempotency)', async () => {
    const payload: LotCreatedPayload = {
      lotId: 'lot-2',
      lotNo: 'LOT-002',
      materialCode: 'MAT-B',
      quantity: 50,
      locationId: 'LOC-1',
      tenantId: 'TENANT-1',
      createdAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.INVENTORY_LOT_CREATED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: 'lot-2',
      aggregateType: 'MaterialLot',
      sequence: 1,
      data: payload,
    });

    await handler.handleIdempotent(event);
    await handler.handleIdempotent(event); // duplicate
    expect(prisma.lotProjection.create).toHaveBeenCalledOnce();
  });

  it('INVENTORY_RESERVATION_CREATED updates reservedQty and status', async () => {
    const createPayload: LotCreatedPayload = {
      lotId: 'lot-3',
      lotNo: 'LOT-003',
      materialCode: 'MAT-C',
      quantity: 100,
      locationId: 'LOC-1',
      tenantId: 'TENANT-1',
      createdAt: new Date().toISOString(),
    };
    await handler.handleIdempotent(
      createEventEnvelope({
        type: MesEventType.INVENTORY_LOT_CREATED,
        source: 'urn:mes:inventory-service:MaterialLot',
        aggregateId: 'lot-3',
        aggregateType: 'MaterialLot',
        sequence: 1,
        data: createPayload,
      }),
    );

    const reservePayload: LotReservedPayload = { lotId: 'lot-3', orderId: 'ORDER-1', qty: 30 };
    await handler.handleIdempotent(
      createEventEnvelope({
        type: MesEventType.INVENTORY_RESERVATION_CREATED,
        source: 'urn:mes:inventory-service:MaterialLot',
        aggregateId: 'lot-3',
        aggregateType: 'MaterialLot',
        sequence: 2,
        data: reservePayload,
      }),
    );
    expect(prisma.lotProjection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESERVED' }),
      }),
    );
  });
});
