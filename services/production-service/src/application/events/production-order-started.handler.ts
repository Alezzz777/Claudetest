import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type { ProductionOrderStartedPayload } from '../../domain/production-order.aggregate';

/**
 * Idempotent event handler — updates the production_order_projections table
 * when a ProductionOrderStarted event arrives from Kafka.
 *
 * Idempotency: we upsert keyed on (orderId + eventId).
 * If the same event is delivered twice (Kafka at-least-once), the second
 * upsert is a no-op because updatedAt / actualStartAt won't change.
 */
@Injectable()
export class ProductionOrderStartedHandler {
  private readonly logger = new Logger(ProductionOrderStartedHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async handle(envelope: EventEnvelope<ProductionOrderStartedPayload>): Promise<void> {
    const { data, id: eventId } = envelope;

    this.logger.debug(
      `Handling ${MesEventType.PRODUCTION_ORDER_STARTED} event ${eventId} for order ${data.orderId}`,
    );

    // Idempotency check — skip if already processed
    const alreadyProcessed = await this.prisma.processedEvent.findUnique({
      where: { eventId },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Event ${eventId} already processed; skipping`);
      return;
    }

    // Update projection + mark event as processed in single transaction
    await this.prisma.$transaction([
      this.prisma.productionOrderProjection.update({
        where: { orderId: data.orderId },
        data: {
          status: 'IN_PROGRESS',
          actualStartAt: new Date(data.startedAt),
          updatedAt: new Date(),
        },
      }),
      this.prisma.processedEvent.create({
        data: { eventId, processedAt: new Date() },
      }),
    ]);

    this.logger.log(`Projection updated for order ${data.orderId} → IN_PROGRESS`);
  }
}
