import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { OutboxPublisher } from '../../infrastructure/persistence/outbox.publisher';
import { ProductionOrderAggregate } from '../../domain/production-order.aggregate';

// ─── Command ──────────────────────────────────────────────────────────────────

export class ReleaseProductionOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly releasedBy: string,
    public readonly correlationId: string,
  ) {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@CommandHandler(ReleaseProductionOrderCommand)
export class ReleaseProductionOrderHandler
  implements ICommandHandler<ReleaseProductionOrderCommand>
{
  private readonly logger = new Logger(ReleaseProductionOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository)
    private readonly eventStore: EventStoreRepository,
    @Inject(OutboxPublisher)
    private readonly outbox: OutboxPublisher,
  ) {}

  async execute(command: ReleaseProductionOrderCommand): Promise<void> {
    const { orderId, releasedBy, correlationId } = command;

    this.logger.log(`Releasing production order ${orderId} by ${releasedBy}`);

    // Rehydrate aggregate
    const events = await this.eventStore.load(orderId);
    const order = ProductionOrderAggregate.rehydrate(events);

    if (order.status !== 'DRAFT') {
      throw new Error(`Cannot release order in status ${order.status}; must be DRAFT`);
    }

    // Manually create event since aggregate doesn't have a release() method
    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_RELEASED,
      source: 'urn:mes:production-service:ProductionOrder',
      aggregateId: orderId,
      aggregateType: 'ProductionOrder',
      sequence: order.sequence + 1,
      data: { orderId, releasedBy, releasedAt: new Date().toISOString() },
      correlationId,
    });

    // Apply to aggregate (updates state + adds to uncommitted)
    order.apply(event);
    const newEvents = order.popUncommittedEvents();

    await this.eventStore.saveWithOutbox(orderId, order.sequence, newEvents, this.outbox);

    this.logger.log(`Production order ${orderId} released`);
  }
}
