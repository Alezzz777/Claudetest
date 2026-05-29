import { describe, it, expect } from 'vitest';
import { ProductionOrderAggregate } from '../domain/production-order.aggregate';
import { createEventEnvelope, MesEventType } from '@mes/shared';

const makeParams = (overrides = {}) => ({
  orderNo: 'ORD-001',
  recipeId: 'recipe-123',
  recipeVersion: '1.0',
  plannedQty: 100,
  uom: 'EA',
  scheduledStartAt: new Date('2026-01-01T08:00:00Z'),
  scheduledEndAt: new Date('2026-01-01T16:00:00Z'),
  workCenterId: 'WC-01',
  tenantId: 'tenant-abc',
  correlationId: 'corr-123',
  ...overrides,
});

describe('ProductionOrderAggregate', () => {
  describe('create()', () => {
    it('creates aggregate with DRAFT status', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      expect(order.status).toBe('DRAFT');
      expect(order.orderNo).toBe('ORD-001');
      expect(order.plannedQty).toBe(100);
      expect(order.completedQty).toBe(0);
      expect(order.sequence).toBe(1);
    });

    it('produces one uncommitted event', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      const events = order.popUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(MesEventType.PRODUCTION_ORDER_CREATED);
    });

    it('clears uncommitted events after pop', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();
      expect(order.popUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('state transitions via apply()', () => {
    it('DRAFT → RELEASED via apply(RELEASED)', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();

      const event = createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_RELEASED,
        source: 'test',
        aggregateId: order.id,
        aggregateType: 'ProductionOrder',
        sequence: 2,
        data: { orderId: order.id },
      });
      order.apply(event);
      expect(order.status).toBe('RELEASED');
    });
  });

  describe('start()', () => {
    it('throws if order is not RELEASED', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();
      expect(() => order.start('op-1')).toThrow('must be RELEASED');
    });

    it('transitions to IN_PROGRESS when RELEASED', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();
      order.apply(createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_RELEASED,
        source: 'test',
        aggregateId: order.id,
        aggregateType: 'ProductionOrder',
        sequence: 2,
        data: { orderId: order.id },
      }));

      order.start('op-1', 'corr-1');
      expect(order.status).toBe('IN_PROGRESS');
      const events = order.popUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(MesEventType.PRODUCTION_ORDER_STARTED);
    });
  });

  describe('completeOperation()', () => {
    it('throws if not IN_PROGRESS', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();
      expect(() =>
        order.completeOperation({ operationId: 'op1', operationNo: 1, completedQty: 10, scrapQty: 0, operatorId: 'usr' })
      ).toThrow('IN_PROGRESS');
    });

    it('increments completedQty when IN_PROGRESS', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();
      order.apply(createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_RELEASED,
        source: 'test', aggregateId: order.id, aggregateType: 'ProductionOrder',
        sequence: 2, data: { orderId: order.id },
      }));
      order.start('op-1');
      order.popUncommittedEvents();

      order.completeOperation({ operationId: 'op1', operationNo: 1, completedQty: 30, scrapQty: 2, operatorId: 'usr' });
      expect(order.completedQty).toBe(30);
    });
  });

  describe('COMPLETED and CANCELLED transitions', () => {
    it('apply COMPLETED sets status', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();
      order.apply(createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_COMPLETED,
        source: 'test', aggregateId: order.id, aggregateType: 'ProductionOrder',
        sequence: 2, data: { orderId: order.id },
      }));
      expect(order.status).toBe('COMPLETED');
    });

    it('apply CANCELLED sets status', () => {
      const order = ProductionOrderAggregate.create(makeParams());
      order.popUncommittedEvents();
      order.apply(createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_CANCELLED,
        source: 'test', aggregateId: order.id, aggregateType: 'ProductionOrder',
        sequence: 2, data: { orderId: order.id },
      }));
      expect(order.status).toBe('CANCELLED');
    });
  });

  describe('rehydrate()', () => {
    it('throws on empty events', () => {
      expect(() => ProductionOrderAggregate.rehydrate([])).toThrow('empty');
    });

    it('rebuilds correct state from event stream', () => {
      const original = ProductionOrderAggregate.create(makeParams());
      const events = original.popUncommittedEvents();

      const releaseEvent = createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_RELEASED,
        source: 'test', aggregateId: original.id, aggregateType: 'ProductionOrder',
        sequence: 2, data: { orderId: original.id },
      });

      const rehydrated = ProductionOrderAggregate.rehydrate([...events, releaseEvent]);
      expect(rehydrated.id).toBe(original.id);
      expect(rehydrated.status).toBe('RELEASED');
      expect(rehydrated.orderNo).toBe('ORD-001');
      expect(rehydrated.sequence).toBe(2);
    });
  });
});
