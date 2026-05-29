import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetAuditLogQuery {
  constructor(
    public readonly aggregateId?: string,
    public readonly from?: Date,
    public readonly to?: Date,
    public readonly limit = 50,
  ) {}
}

export interface AuditLogEntry {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  source: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

@QueryHandler(GetAuditLogQuery)
export class GetAuditLogHandler implements IQueryHandler<GetAuditLogQuery, AuditLogEntry[]> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: GetAuditLogQuery): Promise<AuditLogEntry[]> {
    const where: Record<string, unknown> = {};
    if (q.aggregateId) where['aggregateId'] = q.aggregateId;
    if (q.from || q.to) {
      where['occurredAt'] = {
        ...(q.from && { gte: q.from }),
        ...(q.to && { lte: q.to }),
      };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: q.limit,
    });

    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId,
      correlationId: r.correlationId,
      source: r.source,
      payload: r.payload as Record<string, unknown>,
      occurredAt: r.occurredAt,
    }));
  }
}
