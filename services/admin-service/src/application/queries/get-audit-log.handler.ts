import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetAuditLogQuery {
  constructor(
    public readonly aggregateId?: string,
    public readonly from?: Date,
    public readonly to?: Date,
    public readonly limit: number = 50,
  ) {}
}

export interface AuditLogEntry {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  occurredAt: Date;
}

@QueryHandler(GetAuditLogQuery)
export class GetAuditLogHandler implements IQueryHandler<GetAuditLogQuery> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(query: GetAuditLogQuery): Promise<AuditLogEntry[]> {
    const where: Record<string, unknown> = {};
    if (query.aggregateId) where['aggregateId'] = query.aggregateId;
    if (query.from || query.to) {
      where['occurredAt'] = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: Math.min(query.limit, 200),
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId,
      correlationId: r.correlationId,
      occurredAt: r.occurredAt,
    }));
  }
}
