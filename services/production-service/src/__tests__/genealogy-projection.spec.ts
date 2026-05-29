import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenealogyProjectionHandler } from '../application/events/genealogy-projection.handler';
import { createEventEnvelope, MesEventType } from '@mes/shared';

const mockPrisma = {
  processedEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  genealogyNode: {
    create: vi.fn(),
  },
};

describe('GenealogyProjectionHandler', () => {
  let handler: GenealogyProjectionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new GenealogyProjectionHandler(mockPrisma as never);
    mockPrisma.processedEvent.findUnique.mockResolvedValue(null);
    mockPrisma.processedEvent.create.mockResolvedValue({});
    mockPrisma.genealogyNode.create.mockResolvedValue({});
  });

  it('PRODUCTION_ORDER_STARTED creates ORDER node', async () => {
    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_STARTED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 1,
      data: { orderId: 'ord-1', startedAt: '2026-01-01T09:00:00Z', operatorId: 'op-1' },
    });

    await handler.handleIdempotent(event);

    expect(mockPrisma.genealogyNode.create).toHaveBeenCalledOnce();
    const args = mockPrisma.genealogyNode.create.mock.calls[0][0];
    expect(args.data.nodeType).toBe('ORDER');
    expect(args.data.nodeId).toBe('ord-1');
    expect(args.data.parentId).toBeNull();
    expect(args.data.orderId).toBe('ord-1');
  });

  it('PRODUCTION_OPERATION_COMPLETED creates OPERATION node linked to order', async () => {
    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_OPERATION_COMPLETED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 2,
      data: {
        orderId: 'ord-1',
        operationId: 'op-A',
        operationNo: 1,
        completedQty: 20,
        scrapQty: 0,
        operatorId: 'usr-1',
        completedAt: '2026-01-01T10:00:00Z',
      },
    });

    await handler.handleIdempotent(event);

    expect(mockPrisma.genealogyNode.create).toHaveBeenCalledOnce();
    const args = mockPrisma.genealogyNode.create.mock.calls[0][0];
    expect(args.data.nodeType).toBe('OPERATION');
    expect(args.data.nodeId).toBe('op-A');
    expect(args.data.parentId).toBe('ord-1');
  });

  it('PRODUCTION_MATERIAL_CONSUMED creates MATERIAL node linked to operation', async () => {
    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_MATERIAL_CONSUMED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 3,
      data: {
        orderId: 'ord-1',
        materialId: 'mat-XYZ',
        operationId: 'op-A',
        quantity: 5,
        uom: 'KG',
        consumedAt: '2026-01-01T09:30:00Z',
      },
    });

    await handler.handleIdempotent(event);

    expect(mockPrisma.genealogyNode.create).toHaveBeenCalledOnce();
    const args = mockPrisma.genealogyNode.create.mock.calls[0][0];
    expect(args.data.nodeType).toBe('MATERIAL');
    expect(args.data.nodeId).toBe('mat-XYZ');
    expect(args.data.parentId).toBe('op-A');
  });

  it('skips duplicate events (idempotency)', async () => {
    mockPrisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'genealogy:some-id', processedAt: new Date() });

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_STARTED,
      source: 'test',
      aggregateId: 'ord-1',
      aggregateType: 'ProductionOrder',
      sequence: 1,
      data: { orderId: 'ord-1', startedAt: '2026-01-01T09:00:00Z', operatorId: 'op-1' },
    });

    await handler.handleIdempotent(event);
    expect(mockPrisma.genealogyNode.create).not.toHaveBeenCalled();
  });
});
