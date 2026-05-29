import { describe, it, expect, vi } from 'vitest';
import { AggregateRoot } from '../domain/aggregate-root';
import { createEventEnvelope, EventEnvelope } from '../events/event-envelope';

// ── Concrete test double ───────────────────────────────────────────────────────
class TestAggregate extends AggregateRoot {
  public handledEvents: EventEnvelope[] = [];
  public handlerCallCount = 0;

  getAggregateType(): string {
    return 'TestAggregate';
  }

  protected handleEvent(event: EventEnvelope): void {
    this.handledEvents.push(event);
    this.handlerCallCount++;
  }

  // Expose apply() for testing
  doApply(event: EventEnvelope): void {
    this.apply(event);
  }

  // Helper to set id for rehydration tests
  setId(id: string): void {
    this._id = id;
  }
}

function makeEvent(seq: number = 1): EventEnvelope {
  return createEventEnvelope({
    type: 'test.aggregate.created',
    source: 'urn:mes:test:TestAggregate',
    aggregateId: 'agg-001',
    aggregateType: 'TestAggregate',
    sequence: seq,
    data: { seq },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('AggregateRoot', () => {
  describe('initial state', () => {
    it('starts with version 0', () => {
      const agg = new TestAggregate();
      expect(agg.getVersion()).toBe(0);
    });

    it('starts with empty uncommitted events', () => {
      const agg = new TestAggregate();
      expect(agg.popUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('apply()', () => {
    it('increments version by 1 after each event', () => {
      const agg = new TestAggregate();
      agg.doApply(makeEvent(1));
      expect(agg.getVersion()).toBe(1);
      agg.doApply(makeEvent(2));
      expect(agg.getVersion()).toBe(2);
    });

    it('adds the event to uncommitted list', () => {
      const agg = new TestAggregate();
      const ev = makeEvent(1);
      agg.doApply(ev);
      const uncommitted = agg.popUncommittedEvents();
      expect(uncommitted).toHaveLength(1);
      expect(uncommitted[0]).toBe(ev);
    });

    it('calls handleEvent for each applied event', () => {
      const agg = new TestAggregate();
      agg.doApply(makeEvent(1));
      agg.doApply(makeEvent(2));
      expect(agg.handlerCallCount).toBe(2);
    });
  });

  describe('popUncommittedEvents()', () => {
    it('returns all pending events', () => {
      const agg = new TestAggregate();
      agg.doApply(makeEvent(1));
      agg.doApply(makeEvent(2));
      agg.doApply(makeEvent(3));
      const events = agg.popUncommittedEvents();
      expect(events).toHaveLength(3);
    });

    it('clears the internal list after first call', () => {
      const agg = new TestAggregate();
      agg.doApply(makeEvent(1));
      agg.popUncommittedEvents(); // first call — clears the list
      const second = agg.popUncommittedEvents();
      expect(second).toHaveLength(0);
    });

    it('does not mutate the returned array when more events are applied', () => {
      const agg = new TestAggregate();
      agg.doApply(makeEvent(1));
      const snapshot = agg.popUncommittedEvents();
      agg.doApply(makeEvent(2));
      // snapshot should still have 1 element from before
      expect(snapshot).toHaveLength(1);
    });
  });

  describe('rehydrate()', () => {
    it('restores version equal to the number of historical events', () => {
      const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
      const agg = TestAggregate.rehydrate(events);
      expect(agg.getVersion()).toBe(3);
    });

    it('leaves uncommitted list empty after rehydration', () => {
      const events = [makeEvent(1), makeEvent(2)];
      const agg = TestAggregate.rehydrate(events);
      expect(agg.popUncommittedEvents()).toHaveLength(0);
    });

    it('calls handleEvent for each historical event', () => {
      const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
      const agg = TestAggregate.rehydrate(events);
      expect(agg.handlerCallCount).toBe(3);
    });

    it('works correctly with zero events', () => {
      const agg = TestAggregate.rehydrate([]);
      expect(agg.getVersion()).toBe(0);
      expect(agg.popUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('getExpectedVersion()', () => {
    it('returns 0 before any events are applied', () => {
      const agg = new TestAggregate();
      expect(agg.getExpectedVersion()).toBe(0);
    });

    it('returns current version after applying events', () => {
      const agg = new TestAggregate();
      agg.doApply(makeEvent(1));
      expect(agg.getExpectedVersion()).toBe(1);
      agg.doApply(makeEvent(2));
      expect(agg.getExpectedVersion()).toBe(2);
    });

    it('tracks version accurately for optimistic concurrency check', () => {
      const agg = new TestAggregate();
      // Simulate applying N events
      for (let i = 1; i <= 5; i++) {
        agg.doApply(makeEvent(i));
      }
      expect(agg.getExpectedVersion()).toBe(5);
    });
  });

  describe('handleEvent spy behaviour', () => {
    it('handleEvent is called exactly once per apply call', () => {
      const agg = new TestAggregate();
      const spy = vi.spyOn(agg as unknown as { handleEvent: (e: EventEnvelope) => void }, 'handleEvent');
      agg.doApply(makeEvent(1));
      expect(spy).toHaveBeenCalledTimes(1);
      agg.doApply(makeEvent(2));
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
