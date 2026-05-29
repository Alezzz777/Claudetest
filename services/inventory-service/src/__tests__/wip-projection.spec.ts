import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LotProjectionHandler } from '../application/events/lot-moved.handler';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import type { LotCreatedPayload, LotConsumedPayload } from '../domain/material-lot.aggregate';

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

describe('WIP Projection via LotProjectionHandler', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let handler: LotProjectionHandler;

  beforeEach(() => {
    prisma = makePrisma();
    handler = new LotProjectionHandler(prisma as never);
  });

  async function setupLot(lotId: string) {
    const payload: LotCreatedPayload = {
      lotId,
      lotNo: `LOT-${lotId}`,
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
        aggregateId: lotId,
        aggregateType: 'MaterialLot',
        sequence: 1,
        data: payload,
      }),
    );
  }

  it('INVENTORY_LOT_CONSUMED upserts WipProjection', async () => {
    await setupLot('lot-wip-1');

    const consumedPayload: LotConsumedPayload = {
      lotId: 'lot-wip-1',
      orderId: 'ORDER-WIP-1',
      qty: 40,
      consumedBy: 'USER-1',
      remainingQuantity: 60,
      consumedAt: new Date().toISOString(),
    };
    await handler.handleIdempotent(
      createEventEnvelope({
        type: MesEventType.INVENTORY_LOT_CONSUMED,
        source: 'urn:mes:inventory-service:MaterialLot',
        aggregateId: 'lot-wip-1',
        aggregateType: 'MaterialLot',
        sequence: 2,
        data: consumedPayload,
      }),
    );

    expect(prisma.wipProjection.upsert).toHaveBeenCalledOnce();
    expect(prisma.wipProjection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'ORDER-WIP-1' },
      }),
    );
  });

  it('duplicate INVENTORY_LOT_CONSUMED events are skipped (idempotency)', async () => {
    await setupLot('lot-wip-2');

    const consumedPayload: LotConsumedPayload = {
      lotId: 'lot-wip-2',
      orderId: 'ORDER-WIP-2',
      qty: 20,
      consumedBy: 'USER-1',
      remainingQuantity: 80,
      consumedAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.INVENTORY_LOT_CONSUMED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: 'lot-wip-2',
      aggregateType: 'MaterialLot',
      sequence: 2,
      data: consumedPayload,
    });

    await handler.handleIdempotent(event);
    await handler.handleIdempotent(event); // duplicate

    expect(prisma.wipProjection.upsert).toHaveBeenCalledOnce();
  });
});
