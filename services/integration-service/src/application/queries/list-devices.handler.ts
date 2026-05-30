import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { DeviceStatusReadModel } from './get-device-status.handler';

export class ListDevicesQuery {
  constructor(
    public readonly status?: string,
    public readonly protocol?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

export interface PaginatedDevices {
  items: DeviceStatusReadModel[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListDevicesQuery)
export class ListDevicesHandler implements IQueryHandler<ListDevicesQuery, PaginatedDevices> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: ListDevicesQuery): Promise<PaginatedDevices> {
    const where: Record<string, unknown> = {};
    if (q.status) where['status'] = q.status;
    if (q.protocol) where['protocol'] = q.protocol;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.deviceProjection.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { lastSeenAt: 'desc' },
      }),
      this.prisma.deviceProjection.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        deviceId: row.deviceId,
        status: row.status,
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        protocol: row.protocol,
        unsPath: row.unsPath ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
