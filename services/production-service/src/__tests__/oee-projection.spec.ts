import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetOeeHandler } from '../application/queries/get-oee.handler';

const mockPrisma = {
  oeeProjection: {
    findMany: vi.fn(),
  },
};

describe('GetOeeHandler', () => {
  let handler: GetOeeHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new GetOeeHandler(mockPrisma as never);
  });

  it('returns zeros when no rows found', async () => {
    mockPrisma.oeeProjection.findMany.mockResolvedValue([]);
    const result = await handler.execute({ workCenterId: 'WC-01', from: new Date(), to: new Date() });
    expect(result.availability).toBe(0);
    expect(result.performance).toBe(0);
    expect(result.quality).toBe(0);
    expect(result.oee).toBe(0);
  });

  it('averages OEE metrics from multiple rows', async () => {
    mockPrisma.oeeProjection.findMany.mockResolvedValue([
      { availability: 0.9, performance: 0.8, quality: 0.95, oee: 0.684, measuredAt: new Date('2026-01-01T10:00:00Z') },
      { availability: 0.85, performance: 0.75, quality: 0.90, oee: 0.574, measuredAt: new Date('2026-01-01T12:00:00Z') },
    ]);

    const result = await handler.execute({
      workCenterId: 'WC-01',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-01T23:59:59Z'),
    });

    expect(result.workCenterId).toBe('WC-01');
    expect(result.availability).toBeCloseTo(0.875);
    expect(result.performance).toBeCloseTo(0.775);
    expect(result.quality).toBeCloseTo(0.925);
    expect(result.oee).toBeCloseTo(0.629);
  });

  it('returns values between 0 and 1', async () => {
    mockPrisma.oeeProjection.findMany.mockResolvedValue([
      { availability: 0.95, performance: 0.88, quality: 0.99, oee: 0.827, measuredAt: new Date() },
    ]);

    const result = await handler.execute({ workCenterId: 'WC-02', from: new Date(), to: new Date() });

    expect(result.availability).toBeGreaterThanOrEqual(0);
    expect(result.availability).toBeLessThanOrEqual(1);
    expect(result.performance).toBeGreaterThanOrEqual(0);
    expect(result.performance).toBeLessThanOrEqual(1);
    expect(result.quality).toBeGreaterThanOrEqual(0);
    expect(result.quality).toBeLessThanOrEqual(1);
    expect(result.oee).toBeGreaterThanOrEqual(0);
    expect(result.oee).toBeLessThanOrEqual(1);
  });
});
