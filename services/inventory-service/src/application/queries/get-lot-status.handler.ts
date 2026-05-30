import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetLotStatusQuery {
  constructor(public readonly lotId: string) {}
}

export interface LotReadModel {
  lotId: string;
  lotNo: string;
  materialCode: string;
  quantity: number;
  reservedQty: number;
  locationId: string;
  status: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

@QueryHandler(GetLotStatusQuery)
export class GetLotStatusHandler implements IQueryHandler<GetLotStatusQuery, LotReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: GetLotStatusQuery): Promise<LotReadModel> {
    const row = await this.prisma.lotProjection.findUnique({ where: { lotId: q.lotId } });
    if (!row) throw new NotFoundException(`Lot ${q.lotId} not found`);
    return {
      lotId: row.lotId,
      lotNo: row.lotNo,
      materialCode: row.materialCode,
      quantity: row.quantity,
      reservedQty: row.reservedQty,
      locationId: row.locationId,
      status: row.status,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
