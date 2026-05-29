import { describe, it, expect } from 'vitest';
import { WorkOrderAggregate } from '../domain/work-order.aggregate';

const defaultParams = {
  equipmentId: 'eq-1',
  workOrderNo: 'WO-001',
  type: 'CORRECTIVE' as const,
  description: 'Fix the spindle',
  createdBy: 'user-1',
};

describe('WorkOrderAggregate', () => {
  it('create() produces DRAFT status', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    expect(wo.status).toBe('DRAFT');
    expect(wo.workOrderNo).toBe('WO-001');
    const events = wo.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('maintenance.work-order.created');
  });

  it('plan() transitions to PLANNED', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.popUncommittedEvents();
    wo.plan(new Date(), new Date(Date.now() + 3600000), 'tech-1');
    expect(wo.status).toBe('PLANNED');
    const events = wo.popUncommittedEvents();
    expect(events[0]?.type).toBe('maintenance.work-order.planned');
  });

  it('start() transitions to IN_PROGRESS', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.plan(new Date(), new Date(Date.now() + 3600000), 'tech-1');
    wo.popUncommittedEvents();
    wo.start();
    expect(wo.status).toBe('IN_PROGRESS');
    const events = wo.popUncommittedEvents();
    expect(events[0]?.type).toBe('maintenance.work-order.started');
  });

  it('start() throws if not PLANNED', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.popUncommittedEvents();
    // status is DRAFT
    expect(() => wo.start()).toThrow();
  });

  it('complete() transitions to COMPLETED', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.plan(new Date(), new Date(Date.now() + 3600000), 'tech-1');
    wo.start();
    wo.popUncommittedEvents();
    wo.complete('Replaced bearings', 'tech-1');
    expect(wo.status).toBe('COMPLETED');
    const events = wo.popUncommittedEvents();
    expect(events[0]?.type).toBe('maintenance.work-order.completed');
  });

  it('complete() throws if not IN_PROGRESS', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.popUncommittedEvents();
    expect(() => wo.complete('fix', 'user-1')).toThrow();
  });

  it('cancel() is idempotent when already COMPLETED', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.plan(new Date(), new Date(Date.now() + 3600000), 'tech-1');
    wo.start();
    wo.complete('done', 'tech-1');
    wo.popUncommittedEvents();
    wo.cancel('no reason', 'user-1');
    expect(wo.status).toBe('COMPLETED');
    expect(wo.popUncommittedEvents()).toHaveLength(0);
  });

  it('cancel() is idempotent when already CANCELLED', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.cancel('reason1', 'user-1');
    wo.popUncommittedEvents();
    wo.cancel('reason2', 'user-1');
    expect(wo.status).toBe('CANCELLED');
    expect(wo.popUncommittedEvents()).toHaveLength(0);
  });

  it('rehydrate() restores correct state', () => {
    const wo = WorkOrderAggregate.create(defaultParams);
    wo.plan(new Date(), new Date(Date.now() + 3600000), 'tech-1');
    wo.start();
    const allEvents = wo.popUncommittedEvents();

    const rehydrated = WorkOrderAggregate.rehydrate(allEvents);
    expect(rehydrated.status).toBe('IN_PROGRESS');
    expect(rehydrated.workOrderNo).toBe('WO-001');
    expect(rehydrated.equipmentId).toBe('eq-1');
  });
});
