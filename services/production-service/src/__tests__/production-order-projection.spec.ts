import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionOrderProjectionHandler } from '../application/events/production-order-projection.handler';
import { createEventEnvelope, MesEventType } from '@mes/shared';

const mockPrisma = {
  processedEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  productionOrderProjection: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  oeeProjection: {
    create: vi.fn(),
  },
};

describe('ProductionOrderProjectionHandler', () => {
  let handler: ProductionOrderProjectionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ProductionOrderProjectionHandler(mockPrisma as never);
    mockPrisma.processedEvent.findUnique.mockResolvedValue(null);
    mockPrisma.processedEvent.create.mockResolvedValue({});
  });

  it('PRODUCTION_ORDER_CREATED creates projection row', async () => {
    mockPrisma.productionOrderProjection.create.mockResolvedValue({});

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_CREATED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 1,
      data: {
        orderId: 'ord-1',
        orderNo: 'ORD-001',
        recipeId: 'r1',
        recipeVersion: '1.0',
        plannedQty: 100,
        uom: 'EA',
        scheduledStartAt: '2026-01-01T08:00:00Z',
        scheduledEndAt: '2026-01-01T16:00:00Z',
        workCenterId: 'WC-01',
        tenantId: 'tenant-1',
      },
    });

    await handler.handleIdempotent(event);
    expect(mockPrisma.productionOrderProjection.create).toHaveBeenCalledOnce();
    const args = mockPrisma.productionOrderProjection.create.mock.calls[0][0];
    expect(args.data.status).toBe('DRAFT');
    expect(args.data.orderId).toBe('ord-1');
  });

  it('PRODUCTION_ORDER_RELEASED updates status to RELEASED', async () => {
    mockPrisma.productionOrderProjection.update.mockResolvedValue({});

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_RELEASED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 2,
      data: { orderId: 'ord-1' },
    });

    await handler.handleIdempotent(event);
    expect(mockPrisma.productionOrderProjection.update).toHaveBeenCalledWith({
      where: { orderId: 'ord-1' },
      data: { status: 'RELEASED' },
    });
  });

  it('PRODUCTION_ORDER_STARTED updates status to IN_PROGRESS', async () => {
    mockPrisma.productionOrderProjection.update.mockResolvedValue({});

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_STARTED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 3,
      data: { orderId: 'ord-1', startedAt: '2026-01-01T09:00:00Z', operatorId: 'op-1' },
    });

    await handler.handleIdempotent(event);
    const args = mockPrisma.productionOrderProjection.update.mock.calls[0][0];
    expect(args.data.status).toBe('IN_PROGRESS');
    expect(args.data.actualStartAt).toBeInstanceOf(Date);
  });

  it('PRODUCTION_OPERATION_COMPLETED increments completedQty and scrapQty', async () => {
    mockPrisma.productionOrderProjection.findUnique.mockResolvedValue({
      orderId: 'ord-1',
      completedQty: 50,
      scrapQty: 2,
    });
    mockPrisma.productionOrderProjection.update.mockResolvedValue({});

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_OPERATION_COMPLETED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 4,
      data: {
        orderId: 'ord-1',
        operationId: 'opA',
        operationNo: 1,
        completedQty: 20,
        scrapQty: 1,
        operatorId: 'op-1',
        completedAt: '2026-01-01T10:00:00Z',
      },
    });

    await handler.handleIdempotent(event);
    const args = mockPrisma.productionOrderProjection.update.mock.calls[0][0];
    expect(args.data.completedQty).toBe(70);
    expect(args.data.scrapQty).toBe(3);
  });

  it('skips duplicate events (idempotency)', async () => {
    mockPrisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'existing', processedAt: new Date() });

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_RELEASED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 2,
      data: { orderId: 'ord-1' },
    });

    await handler.handleIdempotent(event);
    expect(mockPrisma.productionOrderProjection.update).not.toHaveBeenCalled();
  });

  it('PRODUCTION_ORDER_COMPLETED updates status and actualEndAt', async () => {
    mockPrisma.productionOrderProjection.update.mockResolvedValue({});

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_COMPLETED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 5,
      data: { orderId: 'ord-1', completedAt: '2026-01-01T15:00:00Z' },
    });

    await handler.handleIdempotent(event);
    const args = mockPrisma.productionOrderProjection.update.mock.calls[0][0];
    expect(args.data.status).toBe('COMPLETED');
    expect(args.data.actualEndAt).toBeInstanceOf(Date);
  });

  it('PRODUCTION_ORDER_CANCELLED updates status to CANCELLED', async () => {
    mockPrisma.productionOrderProjection.update.mockResolvedValue({});

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_CANCELLED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 5,
      data: { orderId: 'ord-1' },
    });

    await handler.handleIdempotent(event);
    expect(mockPrisma.productionOrderProjection.update).toHaveBeenCalledWith({
      where: { orderId: 'ord-1' },
      data: { status: 'CANCELLED' },
    });
  });
});
