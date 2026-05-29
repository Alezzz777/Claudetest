import { describe, it, expect } from 'vitest';
import { QualityPlanAggregate, MeasurementSpec } from '../domain/quality-plan.aggregate';
import { MesEventType } from '@mes/shared';

const sampleSpecs: MeasurementSpec[] = [
  { parameterId: 'p1', name: 'Diameter', lsl: 9.8, usl: 10.2, uom: 'mm' },
  { parameterId: 'p2', name: 'Weight', lsl: 49.0, usl: 51.0, uom: 'g' },
];

describe('QualityPlanAggregate', () => {
  it('create() produces status=DRAFT and stores specs', () => {
    const plan = QualityPlanAggregate.create({
      productCode: 'PROD-001',
      specs: sampleSpecs,
      createdBy: 'user-1',
    });

    expect(plan.status).toBe('DRAFT');
    expect(plan.productCode).toBe('PROD-001');
    expect(plan.specs).toHaveLength(2);
    expect(plan.specs[0]!.parameterId).toBe('p1');

    const events = plan.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.QUALITY_PLAN_CREATED);
  });

  it('activate() changes status to ACTIVE', () => {
    const plan = QualityPlanAggregate.create({
      productCode: 'PROD-002',
      specs: sampleSpecs,
      createdBy: 'user-1',
    });
    plan.popUncommittedEvents(); // clear

    plan.activate();

    expect(plan.status).toBe('ACTIVE');
    const events = plan.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.QUALITY_PLAN_ACTIVATED);
  });

  it('activate() throws if status is already ACTIVE', () => {
    const plan = QualityPlanAggregate.create({
      productCode: 'PROD-003',
      specs: sampleSpecs,
      createdBy: 'user-1',
    });
    plan.activate();
    plan.popUncommittedEvents();

    expect(() => plan.activate()).toThrow(/Cannot activate/);
  });

  it('validate() returns inSpec=true for value within [lsl, usl]', () => {
    const plan = QualityPlanAggregate.create({
      productCode: 'PROD-004',
      specs: sampleSpecs,
      createdBy: 'user-1',
    });
    const result = plan.validate(10.0, 'p1');
    expect(result.inSpec).toBe(true);
    expect(result.lsl).toBe(9.8);
    expect(result.usl).toBe(10.2);
  });

  it('validate() returns inSpec=false for value outside [lsl, usl]', () => {
    const plan = QualityPlanAggregate.create({
      productCode: 'PROD-005',
      specs: sampleSpecs,
      createdBy: 'user-1',
    });
    const result = plan.validate(11.0, 'p1');
    expect(result.inSpec).toBe(false);
  });

  it('rehydrate() rebuilds correct state from events', () => {
    const plan = QualityPlanAggregate.create({
      productCode: 'PROD-006',
      specs: sampleSpecs,
      createdBy: 'user-1',
    });
    plan.activate();
    const events = plan.popUncommittedEvents();
    // need all events including create
    const allEvents = QualityPlanAggregate.create({
      productCode: 'PROD-006',
      specs: sampleSpecs,
      createdBy: 'user-1',
    });
    const createEvents = allEvents.popUncommittedEvents();

    const rehydrated = QualityPlanAggregate.rehydrate([...createEvents, ...events]);
    expect(rehydrated.status).toBe('ACTIVE');
    expect(rehydrated.productCode).toBe('PROD-006');
    expect(rehydrated.specs).toHaveLength(2);
  });
});
