import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetWorkOrderQuery {
  constructor(public readonly workOrderId: string) {}
}

export interface WorkOrderReadModel {
  workOrderId: string;
  equipmentId: string;
  workOrderNo: string;
  type: string;
  status: string;
  description: string;
  assignedTo: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  createdAt: string;
}

@QueryHandler(GetWorkOrderQuery)
export class GetWorkOrderHandler implements IQueryHandler<GetWorkOrderQuery, WorkOrderReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: GetWorkOrderQuery): Promise<WorkOrderReadModel> {
    const row = await this.prisma.workOrderProjection.findUnique({ where: { workOrderId: q.workOrderId } });
    if (!row) throw new NotFoundException(`Work order ${q.workOrderId} not found`);
    return {
      workOrderId: row.workOrderId,
      equipmentId: row.equipmentId,
      workOrderNo: row.workOrderNo,
      type: row.type,
      status: row.status,
      description: row.description,
      assignedTo: row.assignedTo ?? null,
      plannedStart: row.plannedStart?.toISOString() ?? null,
      plannedEnd: row.plannedEnd?.toISOString() ?? null,
      actualStart: row.actualStart?.toISOString() ?? null,
      actualEnd: row.actualEnd?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
