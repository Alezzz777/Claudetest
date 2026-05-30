import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, IdempotentEventHandler, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type {
  ProductionOrderStartedPayload,
  ProductionOperationCompletedPayload,
} from '../../domain/production-order.aggregate';

interface MaterialConsumedPayload {
  orderId: string;
  materialId: string;
  operationId: string;
  quantity: number;
  uom: string;
  consumedAt: string;
}

/**
 * Projection handler that builds the genealogy tree for production orders.
 * Stores nodes in the genealogy_nodes table.
 */
@Injectable()
export class GenealogyProjectionHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(GenealogyProjectionHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super();
  }

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const found = await this.prisma.processedEvent.findUnique({
      where: { eventId: `genealogy:${eventId}` },
    });
    return found !== null;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.processedEvent.create({
      data: { eventId: `genealogy:${eventId}`, processedAt: new Date() },
    });
  }

  async handle(event: EventEnvelope<unknown>): Promise<void> {
    this.logger.debug(`Genealogy: handling event ${event.type} [${event.id}]`);

    switch (event.type) {
      case MesEventType.PRODUCTION_ORDER_STARTED: {
        const d = event.data as ProductionOrderStartedPayload;
        await this.prisma.genealogyNode.create({
          data: {
            orderId: d.orderId,
            nodeType: 'ORDER',
            nodeId: d.orderId,
            parentId: null,
            data: d as unknown as Record<string, unknown>,
          },
        });
        break;
      }

      case MesEventType.PRODUCTION_OPERATION_COMPLETED: {
        const d = event.data as ProductionOperationCompletedPayload;
        await this.prisma.genealogyNode.create({
          data: {
            orderId: d.orderId,
            nodeType: 'OPERATION',
            nodeId: d.operationId,
            parentId: d.orderId,
            data: d as unknown as Record<string, unknown>,
          },
        });
        break;
      }

      case MesEventType.PRODUCTION_MATERIAL_CONSUMED: {
        const d = event.data as MaterialConsumedPayload;
        await this.prisma.genealogyNode.create({
          data: {
            orderId: d.orderId,
            nodeType: 'MATERIAL',
            nodeId: d.materialId,
            parentId: d.operationId,
            data: d as unknown as Record<string, unknown>,
          },
        });
        break;
      }

      default:
        this.logger.debug(`Genealogy: unhandled event type ${event.type}; skipping`);
    }
  }
}
