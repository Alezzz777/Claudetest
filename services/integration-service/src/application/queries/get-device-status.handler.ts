import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetDeviceStatusQuery { constructor(public readonly deviceId: string) {} }
export interface DeviceStatusReadModel { deviceId: string; status: string; lastSeenAt: string | null; protocol: string }

@QueryHandler(GetDeviceStatusQuery)
export class GetDeviceStatusHandler implements IQueryHandler<GetDeviceStatusQuery, DeviceStatusReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async execute(q: GetDeviceStatusQuery): Promise<DeviceStatusReadModel> {
    const row = await this.prisma.deviceProjection.findUniqueOrThrow({ where: { deviceId: q.deviceId } });
    return { deviceId: row.deviceId, status: row.status, lastSeenAt: row.lastSeenAt?.toISOString() ?? null, protocol: row.protocol };
  }
}
