import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EdgeModeService } from '../infrastructure/edge/edge-mode.service';

function makePrisma() {
  return {
    edgeBuffer: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeKafka() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

describe('EdgeModeService', () => {
  beforeEach(() => {
    delete process.env['EDGE_MODE'];
  });

  it('bufferEvent calls prisma.edgeBuffer.create', async () => {
    const prisma = makePrisma();
    const kafka = makeKafka();
    const service = new EdgeModeService(prisma as any, kafka as any);

    await service.bufferEvent('test.topic', 'key-1', { foo: 'bar' });

    expect(prisma.edgeBuffer.create).toHaveBeenCalledOnce();
    const call = prisma.edgeBuffer.create.mock.calls[0]?.[0];
    expect(call?.data?.topic).toBe('test.topic');
    expect(call?.data?.partitionKey).toBe('key-1');
    expect(call?.data?.payload).toEqual({ foo: 'bar' });
    expect(call?.data?.replayed).toBe(false);
  });

  it('replayBuffer publishes buffered events and marks replayed=true', async () => {
    const pendingEvent = {
      id: 'evt-1',
      topic: 'mes.uns.telemetry',
      partitionKey: 'device-1',
      payload: { type: 'test' },
      replayed: false,
      createdAt: new Date(),
    };
    const prisma = makePrisma();
    prisma.edgeBuffer.findMany.mockResolvedValue([pendingEvent]);
    const kafka = makeKafka();
    const service = new EdgeModeService(prisma as any, kafka as any);

    await service.replayBuffer();

    expect(kafka.publish).toHaveBeenCalledOnce();
    expect(kafka.publish).toHaveBeenCalledWith(
      'mes.uns.telemetry',
      'device-1',
      JSON.stringify({ type: 'test' }),
    );
    expect(prisma.edgeBuffer.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { replayed: true },
    });
  });

  it('getPendingCount returns correct count', async () => {
    const prisma = makePrisma();
    prisma.edgeBuffer.count.mockResolvedValue(42);
    const kafka = makeKafka();
    const service = new EdgeModeService(prisma as any, kafka as any);

    const count = await service.getPendingCount();
    expect(count).toBe(42);
    expect(prisma.edgeBuffer.count).toHaveBeenCalledWith({ where: { replayed: false } });
  });

  it('isEdge returns true when EDGE_MODE=true', () => {
    process.env['EDGE_MODE'] = 'true';
    const service = new EdgeModeService(makePrisma() as any, makeKafka() as any);
    expect(service.isEdge()).toBe(true);
  });

  it('isEdge returns false when EDGE_MODE is not set', () => {
    const service = new EdgeModeService(makePrisma() as any, makeKafka() as any);
    expect(service.isEdge()).toBe(false);
  });
});
