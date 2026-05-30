import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetEquipmentStatusQuery {
  constructor(public readonly equipmentId: string) {}
}

export interface EquipmentStatusReadModel {
  equipmentId: string;
  name: string;
  workCenterId: string;
  status: string;
  runtimeHours: number;
  lastServiceAt: string | null;
  nextServiceAt: string | null;
  tenantId: string;
}

@QueryHandler(GetEquipmentStatusQuery)
export class GetEquipmentStatusHandler implements IQueryHandler<GetEquipmentStatusQuery, EquipmentStatusReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: GetEquipmentStatusQuery): Promise<EquipmentStatusReadModel> {
    const row = await this.prisma.equipmentProjection.findUnique({ where: { equipmentId: q.equipmentId } });
    if (!row) throw new NotFoundException(`Equipment ${q.equipmentId} not found`);
    return {
      equipmentId: row.equipmentId,
      name: row.name,
      workCenterId: row.workCenterId,
      status: row.status,
      runtimeHours: row.runtimeHours,
      lastServiceAt: row.lastServiceAt?.toISOString() ?? null,
      nextServiceAt: row.nextServiceAt?.toISOString() ?? null,
      tenantId: row.tenantId,
    };
  }
}
