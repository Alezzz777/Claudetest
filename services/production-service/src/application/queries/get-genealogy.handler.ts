import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

// ─── Query ────────────────────────────────────────────────────────────────────

export class GetGenealogyQuery {
  constructor(public readonly orderId: string) {}
}

// ─── Read model ───────────────────────────────────────────────────────────────

export interface GenealogyNodeReadModel {
  id: string;
  nodeType: string;
  nodeId: string;
  parentId: string | null;
  data: unknown;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@QueryHandler(GetGenealogyQuery)
export class GetGenealogyHandler
  implements IQueryHandler<GetGenealogyQuery, GenealogyNodeReadModel[]>
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async execute(query: GetGenealogyQuery): Promise<GenealogyNodeReadModel[]> {
    const rows = await this.prisma.genealogyNode.findMany({
      where: { orderId: query.orderId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      nodeType: row.nodeType,
      nodeId: row.nodeId,
      parentId: row.parentId,
      data: row.data,
    }));
  }
}
