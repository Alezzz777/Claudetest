import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetInspectionResultsQuery {
  constructor(public readonly orderId: string) {}
}

export interface InspectionSummary {
  planId: string;
  orderId: string;
  totalMeasurements: number;
  passCount: number;
  failCount: number;
  ncrCount: number;
  qualityScore: number;
}

@QueryHandler(GetInspectionResultsQuery)
export class GetInspectionResultsHandler implements IQueryHandler<GetInspectionResultsQuery, InspectionSummary> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(query: GetInspectionResultsQuery): Promise<InspectionSummary> {
    const row = await this.prisma.qualityPlanProjection.findFirstOrThrow({
      where: { orderId: query.orderId },
    });
    return {
      planId: row.planId,
      orderId: row.orderId,
      totalMeasurements: row.totalMeasurements,
      passCount: row.passCount,
      failCount: row.failCount,
      ncrCount: row.ncrCount,
      qualityScore: row.totalMeasurements > 0
        ? row.passCount / row.totalMeasurements
        : 0,
    };
  }
}
