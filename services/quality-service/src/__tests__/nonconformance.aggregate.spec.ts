import { describe, it, expect } from 'vitest';
import { NonConformanceAggregate } from '../domain/nonconformance.aggregate';
import { MesEventType } from '@mes/shared';

describe('NonConformanceAggregate', () => {
  it('open() creates NC with status OPEN', () => {
    const nc = NonConformanceAggregate.open({
      orderId: 'order-1',
      description: 'Out-of-spec diameter',
      raisedBy: 'operator-1',
    });

    expect(nc.status).toBe('OPEN');
    expect(nc.orderId).toBe('order-1');
    expect(nc.description).toBe('Out-of-spec diameter');
    expect(nc.raisedBy).toBe('operator-1');

    const events = nc.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.QUALITY_NCR_RAISED);
  });

  it('close() changes status to CLOSED', () => {
    const nc = NonConformanceAggregate.open({
      orderId: 'order-2',
      description: 'Test NC',
      raisedBy: 'operator-1',
    });
    nc.popUncommittedEvents();

    nc.close('supervisor-1', 'Reworked to spec');

    expect(nc.status).toBe('CLOSED');
    const events = nc.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.QUALITY_NCR_DISPOSITIONED);
  });

  it('close() is a noop if already CLOSED (idempotent)', () => {
    const nc = NonConformanceAggregate.open({
      orderId: 'order-3',
      description: 'Test NC',
      raisedBy: 'operator-1',
    });
    nc.popUncommittedEvents();

    nc.close('supervisor-1', 'Reworked to spec');
    nc.popUncommittedEvents();

    // Second close should be noop
    nc.close('supervisor-1', 'Already closed');
    const events = nc.popUncommittedEvents();
    expect(events).toHaveLength(0);
    expect(nc.status).toBe('CLOSED');
  });

  it('rehydrate() reconstructs NC state from events', () => {
    const nc = NonConformanceAggregate.open({
      orderId: 'order-4',
      description: 'Defect',
      raisedBy: 'operator-1',
    });
    const openEvents = nc.popUncommittedEvents();

    const rehydrated = NonConformanceAggregate.rehydrate(openEvents);
    expect(rehydrated.status).toBe('OPEN');
    expect(rehydrated.orderId).toBe('order-4');
  });
});
