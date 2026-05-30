import { describe, it, expect } from 'vitest';
import { EquipmentAggregate } from '../domain/equipment.aggregate';

const defaultParams = {
  name: 'CNC-001',
  workCenterId: 'wc-1',
  maintenanceThresholdHours: 100,
  tenantId: 'tenant-1',
};

describe('EquipmentAggregate', () => {
  it('create() produces AVAILABLE status', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    expect(eq.status).toBe('AVAILABLE');
    expect(eq.name).toBe('CNC-001');
    expect(eq.runtimeHours).toBe(0);
    expect(eq.sequence).toBe(1);
    const events = eq.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('maintenance.equipment.created');
  });

  it('recordRuntime() accumulates hours', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.popUncommittedEvents();
    eq.recordRuntime(50);
    expect(eq.runtimeHours).toBe(50);
    eq.recordRuntime(30);
    expect(eq.runtimeHours).toBe(80);
    const events = eq.popUncommittedEvents();
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('maintenance.equipment.runtime.updated');
  });

  it('recordRuntime() emits threshold-exceeded event when crossed', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.popUncommittedEvents();
    eq.recordRuntime(100);
    const events = eq.popUncommittedEvents();
    expect(events).toHaveLength(2);
    expect(events[1]?.type).toBe('maintenance.equipment.threshold-exceeded');
  });

  it('recordRuntime() does not emit threshold event if already over threshold', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.popUncommittedEvents();
    eq.recordRuntime(100);
    eq.popUncommittedEvents();
    // now already at threshold; add more - should NOT emit another threshold event
    eq.recordRuntime(10);
    const events = eq.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('maintenance.equipment.runtime.updated');
  });

  it('setUnderMaintenance() sets status to UNDER_MAINTENANCE', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.popUncommittedEvents();
    eq.setUnderMaintenance('wo-1');
    expect(eq.status).toBe('UNDER_MAINTENANCE');
    const events = eq.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('maintenance.equipment.down');
  });

  it('setUnderMaintenance() throws if already under maintenance', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.popUncommittedEvents();
    eq.setUnderMaintenance('wo-1');
    eq.popUncommittedEvents();
    expect(() => eq.setUnderMaintenance('wo-2')).toThrow();
  });

  it('restore() sets status to AVAILABLE and resets runtimeHours', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.popUncommittedEvents();
    eq.recordRuntime(50);
    eq.setUnderMaintenance('wo-1');
    eq.popUncommittedEvents();
    eq.restore();
    expect(eq.status).toBe('AVAILABLE');
    expect(eq.runtimeHours).toBe(0);
    const events = eq.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('maintenance.equipment.restored');
  });

  it('restore() throws if not under maintenance or down', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.popUncommittedEvents();
    expect(() => eq.restore()).toThrow();
  });

  it('rehydrate() restores correct state', () => {
    const eq = EquipmentAggregate.create(defaultParams);
    eq.recordRuntime(75);
    eq.setUnderMaintenance('wo-1');
    const allEvents = eq.popUncommittedEvents();

    const rehydrated = EquipmentAggregate.rehydrate(allEvents);
    expect(rehydrated.status).toBe('UNDER_MAINTENANCE');
    expect(rehydrated.runtimeHours).toBe(75);
    expect(rehydrated.name).toBe('CNC-001');
  });
});
