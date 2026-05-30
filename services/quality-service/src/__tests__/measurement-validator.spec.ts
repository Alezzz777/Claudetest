import { describe, it, expect } from 'vitest';
import { QualityPlanAggregate, MeasurementSpec } from '../domain/quality-plan.aggregate';

const specs: MeasurementSpec[] = [
  { parameterId: 'diameter', name: 'Diameter', lsl: 9.8, usl: 10.2, uom: 'mm' },
];

function makePlan(): QualityPlanAggregate {
  return QualityPlanAggregate.create({
    productCode: 'PROD-TEST',
    specs,
    createdBy: 'tester',
  });
}

describe('QualityPlanAggregate.validate() (measurement validator)', () => {
  it('throws if parameterId not found in specs', () => {
    const plan = makePlan();
    expect(() => plan.validate(10.0, 'nonexistent')).toThrow(/Parameter nonexistent not found/);
  });

  it('value within [lsl, usl] → inSpec=true', () => {
    const plan = makePlan();
    const result = plan.validate(10.0, 'diameter');
    expect(result.inSpec).toBe(true);
  });

  it('value exactly at LSL → inSpec=true (inclusive lower bound)', () => {
    const plan = makePlan();
    const result = plan.validate(9.8, 'diameter');
    expect(result.inSpec).toBe(true);
  });

  it('value exactly at USL → inSpec=true (inclusive upper bound)', () => {
    const plan = makePlan();
    const result = plan.validate(10.2, 'diameter');
    expect(result.inSpec).toBe(true);
  });

  it('value below LSL → inSpec=false', () => {
    const plan = makePlan();
    const result = plan.validate(9.5, 'diameter');
    expect(result.inSpec).toBe(false);
  });

  it('value above USL → inSpec=false', () => {
    const plan = makePlan();
    const result = plan.validate(10.5, 'diameter');
    expect(result.inSpec).toBe(false);
  });

  it('returns correct lsl and usl in result', () => {
    const plan = makePlan();
    const result = plan.validate(10.0, 'diameter');
    expect(result.lsl).toBe(9.8);
    expect(result.usl).toBe(10.2);
  });
});
