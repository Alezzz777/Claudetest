import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetInspectionResultsQuery {
  constructor(public readonly orderId: string) {}
}

export interface MeasurementResult {
  id: string;
  orderId: string;
  operationId: string;
  parameterId: string;
  value: number;
  lsl: number;
  usl: number;
  inSpec: boolean;
  recordedBy: string;
  recordedAt: Date;
}

@QueryHandler(GetInspectionResultsQuery)
export class GetInspectionResultsHandler implements IQueryHandler<GetInspectionResultsQuery, MeasurementResult[]> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(query: GetInspectionResultsQuery): Promise<MeasurementResult[]> {
    const rows = await this.prisma.measurementProjection.findMany({
      where: { orderId: query.orderId },
      orderBy: { recordedAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      operationId: r.operationId,
      parameterId: r.parameterId,
      value: r.value,
      lsl: r.lsl,
      usl: r.usl,
      inSpec: r.inSpec,
      recordedBy: r.recordedBy,
      recordedAt: r.recordedAt,
    }));
  }
}
