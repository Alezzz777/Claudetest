import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetEquipmentStatusQuery {
  constructor(public readonly equipmentId: string) {}
}

export interface EquipmentStatusReadModel {
  equipmentId: string;
  name: string;
  status: string;
  runtimeHours: number;
  cycleCount: number;
  openWorkOrders: number;
  nextPmDue: string | null;
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
      status: row.status,
      runtimeHours: row.runtimeHours,
      cycleCount: row.cycleCount,
      openWorkOrders: row.openWorkOrders,
      nextPmDue: row.nextPmDue?.toISOString() ?? null,
    };
  }
}
