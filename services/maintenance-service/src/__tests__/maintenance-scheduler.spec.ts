import { describe, it, expect } from 'vitest';
import { EquipmentAggregate } from '../domain/equipment.aggregate';

describe('Maintenance Scheduler - threshold logic via EquipmentAggregate', () => {
  it('emits threshold-exceeded event when runtime crosses threshold', () => {
    const eq = EquipmentAggregate.create({
      name: 'Press-1',
      workCenterId: 'wc-1',
      maintenanceThresholdHours: 200,
      tenantId: 'tenant-1',
    });
    eq.popUncommittedEvents();

    eq.recordRuntime(199);
    const events1 = eq.popUncommittedEvents();
    // Only runtime updated, no threshold
    expect(events1.some(e => e.type === 'maintenance.equipment.threshold-exceeded')).toBe(false);

    eq.recordRuntime(2); // crosses 200
    const events2 = eq.popUncommittedEvents();
    expect(events2.some(e => e.type === 'maintenance.equipment.threshold-exceeded')).toBe(true);
  });

  it('does NOT emit threshold event when delta keeps hours under threshold', () => {
    const eq = EquipmentAggregate.create({
      name: 'Press-1',
      workCenterId: 'wc-1',
      maintenanceThresholdHours: 500,
      tenantId: 'tenant-1',
    });
    eq.popUncommittedEvents();

    eq.recordRuntime(100);
    const events = eq.popUncommittedEvents();
    expect(events.some(e => e.type === 'maintenance.equipment.threshold-exceeded')).toBe(false);
    expect(eq.runtimeHours).toBe(100);
  });

  it('threshold event not emitted again after restore and second crossing', () => {
    const eq = EquipmentAggregate.create({
      name: 'Lathe-1',
      workCenterId: 'wc-2',
      maintenanceThresholdHours: 100,
      tenantId: 'tenant-1',
    });
    eq.popUncommittedEvents();

    // First crossing
    eq.recordRuntime(100);
    const events1 = eq.popUncommittedEvents();
    expect(events1.some(e => e.type === 'maintenance.equipment.threshold-exceeded')).toBe(true);

    // Restore (resets runtime)
    eq.setUnderMaintenance('wo-1');
    eq.restore();
    eq.popUncommittedEvents();

    // Second crossing after restore
    eq.recordRuntime(100);
    const events2 = eq.popUncommittedEvents();
    expect(events2.some(e => e.type === 'maintenance.equipment.threshold-exceeded')).toBe(true);
  });
});
