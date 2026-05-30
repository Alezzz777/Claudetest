import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetWipQuery {
  constructor(public readonly orderId: string) {}
}

export interface WipReadModel {
  id: string;
  orderId: string;
  materialCode: string;
  quantity: number;
  locationId: string;
  updatedAt: Date;
}

@QueryHandler(GetWipQuery)
export class GetWipHandler implements IQueryHandler<GetWipQuery, WipReadModel | null> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: GetWipQuery): Promise<WipReadModel | null> {
    const row = await this.prisma.wipProjection.findUnique({ where: { orderId: q.orderId } });
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.orderId,
      materialCode: row.materialCode,
      quantity: row.quantity,
      locationId: row.locationId,
      updatedAt: row.updatedAt,
    };
  }
}
