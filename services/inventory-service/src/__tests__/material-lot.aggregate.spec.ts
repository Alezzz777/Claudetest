import { describe, it, expect } from 'vitest';
import { MaterialLotAggregate } from '../domain/material-lot.aggregate';
import { MesEventType } from '@mes/shared';

const baseParams = {
  lotNo: 'LOT-001',
  materialCode: 'MAT-A',
  quantity: 100,
  locationId: 'LOC-1',
  tenantId: 'TENANT-1',
};

describe('MaterialLotAggregate', () => {
  describe('create()', () => {
    it('creates lot with AVAILABLE status', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      expect(agg.status).toBe('AVAILABLE');
      expect(agg.lotNo).toBe('LOT-001');
      expect(agg.quantity).toBe(100);
      expect(agg.reservedQty).toBe(0);
    });

    it('emits INVENTORY_LOT_CREATED event', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      const events = agg.popUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(MesEventType.INVENTORY_LOT_CREATED);
    });
  });

  describe('reserve()', () => {
    it('reduces available quantity and sets status RESERVED', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      agg.reserve('ORDER-1', 30);
      expect(agg.reservedQty).toBe(30);
      expect(agg.status).toBe('RESERVED');
    });

    it('throws if over-reserve', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      expect(() => agg.reserve('ORDER-1', 200)).toThrow();
    });

    it('throws if not AVAILABLE', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      agg.reserve('ORDER-1', 10);
      agg.popUncommittedEvents();
      expect(() => agg.reserve('ORDER-2', 10)).toThrow();
    });
  });

  describe('release()', () => {
    it('restores quantity and sets status AVAILABLE', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      agg.reserve('ORDER-1', 30);
      agg.popUncommittedEvents();
      agg.release('ORDER-1');
      expect(agg.reservedQty).toBe(0);
      expect(agg.status).toBe('AVAILABLE');
    });

    it('is noop if already AVAILABLE', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      agg.release('ORDER-1');
      const events = agg.popUncommittedEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('move()', () => {
    it('updates locationId and sets status MOVED', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      agg.move('LOC-2', 'USER-1');
      expect(agg.locationId).toBe('LOC-2');
      expect(agg.status).toBe('MOVED');
    });
  });

  describe('consume()', () => {
    it('reduces quantity', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      agg.consume('ORDER-1', 40, 'USER-1');
      expect(agg.quantity).toBe(60);
    });

    it('sets status CONSUMED when quantity reaches 0', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      agg.consume('ORDER-1', 100, 'USER-1');
      expect(agg.status).toBe('CONSUMED');
    });

    it('throws if consuming more than available', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.popUncommittedEvents();
      expect(() => agg.consume('ORDER-1', 200, 'USER-1')).toThrow();
    });
  });

  describe('rehydrate()', () => {
    it('rebuilds state from events', () => {
      const original = MaterialLotAggregate.create(baseParams);
      const events = original.popUncommittedEvents();

      const rehydrated = MaterialLotAggregate.rehydrate(events);
      expect(rehydrated.lotNo).toBe('LOT-001');
      expect(rehydrated.status).toBe('AVAILABLE');
      expect(rehydrated.quantity).toBe(100);
    });

    it('rebuilds state after multiple operations', () => {
      const agg = MaterialLotAggregate.create(baseParams);
      agg.reserve('ORDER-1', 50);
      const events = agg.popUncommittedEvents();

      const rehydrated = MaterialLotAggregate.rehydrate(events);
      expect(rehydrated.status).toBe('RESERVED');
      expect(rehydrated.reservedQty).toBe(50);
    });
  });
});
