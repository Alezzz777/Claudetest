import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, IdempotentEventHandler, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type {
  ProductionOrderCreatedPayload,
  ProductionOrderStartedPayload,
  ProductionOperationCompletedPayload,
  OeeMeasuredPayload,
} from '../../domain/production-order.aggregate';

/**
 * Projection handler that maintains the production_order_projections read model.
 * Uses IdempotentEventHandler to guarantee exactly-once processing.
 */
@Injectable()
export class ProductionOrderProjectionHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(ProductionOrderProjectionHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super();
  }

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const found = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    return found !== null;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.processedEvent.create({
      data: { eventId, processedAt: new Date() },
    });
  }

  async handle(event: EventEnvelope<unknown>): Promise<void> {
    this.logger.debug(`Handling event ${event.type} [${event.id}]`);

    switch (event.type) {
      case MesEventType.PRODUCTION_ORDER_CREATED: {
        const d = event.data as ProductionOrderCreatedPayload;
        await this.prisma.productionOrderProjection.create({
          data: {
            orderId: d.orderId,
            orderNo: d.orderNo,
            recipeId: d.recipeId,
            recipeVersion: d.recipeVersion,
            status: 'DRAFT',
            plannedQty: d.plannedQty,
            completedQty: 0,
            scrapQty: 0,
            workCenterId: d.workCenterId,
            scheduledStartAt: new Date(d.scheduledStartAt),
            scheduledEndAt: new Date(d.scheduledEndAt),
            tenantId: d.tenantId,
          },
        });
        break;
      }

      case MesEventType.PRODUCTION_ORDER_RELEASED: {
        const d = event.data as { orderId: string };
        await this.prisma.productionOrderProjection.update({
          where: { orderId: d.orderId },
          data: { status: 'RELEASED' },
        });
        break;
      }

      case MesEventType.PRODUCTION_ORDER_STARTED: {
        const d = event.data as ProductionOrderStartedPayload;
        await this.prisma.productionOrderProjection.update({
          where: { orderId: d.orderId },
          data: { status: 'IN_PROGRESS', actualStartAt: new Date(d.startedAt) },
        });
        break;
      }

      case MesEventType.PRODUCTION_ORDER_PAUSED: {
        const d = event.data as { orderId: string };
        await this.prisma.productionOrderProjection.update({
          where: { orderId: d.orderId },
          data: { status: 'PAUSED' },
        });
        break;
      }

      case MesEventType.PRODUCTION_ORDER_COMPLETED: {
        const d = event.data as { orderId: string; completedAt: string };
        await this.prisma.productionOrderProjection.update({
          where: { orderId: d.orderId },
          data: { status: 'COMPLETED', actualEndAt: new Date(d.completedAt) },
        });
        break;
      }

      case MesEventType.PRODUCTION_ORDER_CANCELLED: {
        const d = event.data as { orderId: string };
        await this.prisma.productionOrderProjection.update({
          where: { orderId: d.orderId },
          data: { status: 'CANCELLED' },
        });
        break;
      }

      case MesEventType.PRODUCTION_OPERATION_COMPLETED: {
        const d = event.data as ProductionOperationCompletedPayload;
        const row = await this.prisma.productionOrderProjection.findUnique({
          where: { orderId: d.orderId },
        });
        if (row) {
          await this.prisma.productionOrderProjection.update({
            where: { orderId: d.orderId },
            data: {
              completedQty: row.completedQty + d.completedQty,
              scrapQty: row.scrapQty + d.scrapQty,
            },
          });
        }
        break;
      }

      case 'production.oee.measured': {
        const d = event.data as OeeMeasuredPayload;
        await this.prisma.oeeProjection.create({
          data: {
            orderId: d.orderId,
            workCenterId: d.workCenterId,
            availability: d.availability,
            performance: d.performance,
            quality: d.quality,
            oee: d.oee,
            measuredAt: new Date(d.measuredAt),
          },
        });
        await this.prisma.productionOrderProjection.update({
          where: { orderId: d.orderId },
          data: { oee: d.oee },
        });
        break;
      }

      default:
        this.logger.debug(`Unhandled event type ${event.type}; skipping`);
    }
  }
}
