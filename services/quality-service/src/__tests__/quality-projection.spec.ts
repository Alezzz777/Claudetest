import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeasurementRecordedHandler } from '../application/events/measurement-recorded.handler';
import { MesEventType, createEventEnvelope } from '@mes/shared';

// Mock PrismaService
function makePrisma() {
  return {
    processedEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    measurementProjection: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    nonConformanceProjection: {
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    qualityPlanProjection: {
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeEnvelope(type: string, data: unknown) {
  return createEventEnvelope({
    type,
    source: 'test',
    aggregateId: 'agg-1',
    aggregateType: 'Test',
    sequence: 1,
    data,
  });
}

describe('MeasurementRecordedHandler (projection)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let handler: MeasurementRecordedHandler;

  beforeEach(() => {
    prisma = makePrisma();
    handler = new MeasurementRecordedHandler(prisma as never);
  });

  it('handles QUALITY_MEASUREMENT_RECORDED → upserts MeasurementProjection', async () => {
    const envelope = makeEnvelope(MesEventType.QUALITY_MEASUREMENT_RECORDED, {
      measurementId: 'meas-1',
      orderId: 'order-1',
      operationId: 'op-1',
      parameterId: 'p1',
      value: 10.0,
      lsl: 9.8,
      usl: 10.2,
      inSpec: true,
      recordedBy: 'user-1',
      recordedAt: new Date().toISOString(),
    });

    await handler.handleIdempotent(envelope as never);

    expect(prisma.measurementProjection.upsert).toHaveBeenCalledOnce();
    expect(prisma.processedEvent.create).toHaveBeenCalledOnce();
  });

  it('handles QUALITY_NCR_RAISED → creates NonConformanceProjection', async () => {
    const envelope = makeEnvelope(MesEventType.QUALITY_NCR_RAISED, {
      ncId: 'nc-1',
      orderId: 'order-1',
      description: 'Out of spec',
      raisedBy: 'user-1',
      raisedAt: new Date().toISOString(),
    });

    await handler.handleIdempotent(envelope as never);

    expect(prisma.nonConformanceProjection.upsert).toHaveBeenCalledOnce();
  });

  it('handles QUALITY_NCR_DISPOSITIONED → updates NonConformanceProjection status', async () => {
    const envelope = makeEnvelope(MesEventType.QUALITY_NCR_DISPOSITIONED, {
      ncId: 'nc-1',
      closedBy: 'user-1',
      resolution: 'Reworked',
      closedAt: new Date().toISOString(),
    });

    await handler.handleIdempotent(envelope as never);

    expect(prisma.nonConformanceProjection.update).toHaveBeenCalledOnce();
    const call = prisma.nonConformanceProjection.update.mock.calls[0]![0] as { data: { status: string } };
    expect(call.data.status).toBe('CLOSED');
  });

  it('handles QUALITY_PLAN_CREATED → upserts QualityPlanProjection', async () => {
    const envelope = makeEnvelope(MesEventType.QUALITY_PLAN_CREATED, {
      planId: 'plan-1',
      productCode: 'PROD-001',
      specs: [],
      createdAt: new Date().toISOString(),
    });

    await handler.handleIdempotent(envelope as never);

    expect(prisma.qualityPlanProjection.upsert).toHaveBeenCalledOnce();
  });

  it('handles QUALITY_PLAN_ACTIVATED → updates status to ACTIVE', async () => {
    const envelope = makeEnvelope(MesEventType.QUALITY_PLAN_ACTIVATED, {
      planId: 'plan-1',
      activatedAt: new Date().toISOString(),
    });

    await handler.handleIdempotent(envelope as never);

    expect(prisma.qualityPlanProjection.update).toHaveBeenCalledOnce();
    const call = prisma.qualityPlanProjection.update.mock.calls[0]![0] as { data: { status: string } };
    expect(call.data.status).toBe('ACTIVE');
  });

  it('skips duplicate events (idempotency check)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'already-processed' });

    const envelope = makeEnvelope(MesEventType.QUALITY_MEASUREMENT_RECORDED, {
      measurementId: 'meas-dup',
      orderId: 'order-1',
      operationId: 'op-1',
      parameterId: 'p1',
      value: 10.0,
      lsl: 9.8,
      usl: 10.2,
      inSpec: true,
      recordedBy: 'user-1',
      recordedAt: new Date().toISOString(),
    });

    await handler.handleIdempotent(envelope as never);

    // Should not have called any projection update
    expect(prisma.measurementProjection.upsert).not.toHaveBeenCalled();
    expect(prisma.processedEvent.create).not.toHaveBeenCalled();
  });
});
