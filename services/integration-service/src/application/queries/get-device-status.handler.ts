import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetDeviceStatusQuery {
  constructor(public readonly deviceId: string) {}
}

export interface DeviceStatusReadModel {
  deviceId: string;
  status: string;
  lastSeenAt: string | null;
  protocol: string;
  unsPath: string | null;
}

@QueryHandler(GetDeviceStatusQuery)
export class GetDeviceStatusHandler implements IQueryHandler<GetDeviceStatusQuery, DeviceStatusReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: GetDeviceStatusQuery): Promise<DeviceStatusReadModel> {
    const row = await this.prisma.deviceProjection.findUnique({ where: { deviceId: q.deviceId } });
    if (!row) throw new NotFoundException(`Device ${q.deviceId} not found`);
    return {
      deviceId: row.deviceId,
      status: row.status,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      protocol: row.protocol,
      unsPath: row.unsPath ?? null,
    };
  }
}
