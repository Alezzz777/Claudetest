import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

// ─── Query ────────────────────────────────────────────────────────────────────

export class GetOeeQuery {
  constructor(
    public readonly workCenterId: string,
    public readonly from: Date,
    public readonly to: Date,
  ) {}
}

// ─── Read model ───────────────────────────────────────────────────────────────

export interface OeeReadModel {
  workCenterId: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  measuredAt: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@QueryHandler(GetOeeQuery)
export class GetOeeHandler implements IQueryHandler<GetOeeQuery, OeeReadModel> {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async execute(query: GetOeeQuery): Promise<OeeReadModel> {
    const { workCenterId, from, to } = query;

    const rows = await this.prisma.oeeProjection.findMany({
      where: {
        workCenterId,
        measuredAt: { gte: from, lte: to },
      },
      orderBy: { measuredAt: 'desc' },
    });

    if (rows.length === 0) {
      return {
        workCenterId,
        availability: 0,
        performance: 0,
        quality: 0,
        oee: 0,
        measuredAt: new Date().toISOString(),
      };
    }

    const avg = (field: keyof typeof rows[0]) =>
      rows.reduce((sum, r) => sum + (r[field] as number), 0) / rows.length;

    const availability = avg('availability');
    const performance = avg('performance');
    const quality = avg('quality');
    const oee = avg('oee');

    return {
      workCenterId,
      availability,
      performance,
      quality,
      oee,
      measuredAt: rows[0]!.measuredAt.toISOString(),
    };
  }
}
