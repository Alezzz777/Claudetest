import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetLotStatusQuery { constructor(public readonly lotId: string) {} }
export interface LotReadModel { lotId: string; lotNumber: string; materialCode: string; quantity: number; uom: string; locationId: string; status: string; }

@QueryHandler(GetLotStatusQuery)
export class GetLotStatusHandler implements IQueryHandler<GetLotStatusQuery, LotReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async execute(q: GetLotStatusQuery): Promise<LotReadModel> {
    const row = await this.prisma.lotProjection.findUnique({ where: { lotId: q.lotId } });
    if (!row) throw new NotFoundException(`Lot ${q.lotId} not found`);
    return { lotId: row.lotId, lotNumber: row.lotNumber, materialCode: row.materialCode, quantity: row.quantity, uom: row.uom, locationId: row.locationId, status: row.status };
  }
}
