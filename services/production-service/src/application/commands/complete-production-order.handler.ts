import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { OutboxPublisher } from '../../infrastructure/persistence/outbox.publisher';
import { ProductionOrderAggregate } from '../../domain/production-order.aggregate';

// ─── Command ──────────────────────────────────────────────────────────────────

export class CompleteProductionOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly completedBy: string,
    public readonly correlationId: string,
  ) {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@CommandHandler(CompleteProductionOrderCommand)
export class CompleteProductionOrderHandler
  implements ICommandHandler<CompleteProductionOrderCommand>
{
  private readonly logger = new Logger(CompleteProductionOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository)
    private readonly eventStore: EventStoreRepository,
    @Inject(OutboxPublisher)
    private readonly outbox: OutboxPublisher,
  ) {}

  async execute(command: CompleteProductionOrderCommand): Promise<void> {
    const { orderId, completedBy, correlationId } = command;

    this.logger.log(`Completing production order ${orderId}`);

    const events = await this.eventStore.load(orderId);
    const order = ProductionOrderAggregate.rehydrate(events);

    if (order.status !== 'IN_PROGRESS') {
      throw new Error(`Cannot complete order in status ${order.status}; must be IN_PROGRESS`);
    }

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_COMPLETED,
      source: 'urn:mes:production-service:ProductionOrder',
      aggregateId: orderId,
      aggregateType: 'ProductionOrder',
      sequence: order.sequence + 1,
      data: { orderId, completedBy, completedAt: new Date().toISOString() },
      correlationId,
    });

    order.apply(event);
    const newEvents = order.popUncommittedEvents();

    await this.eventStore.saveWithOutbox(orderId, order.sequence, newEvents, this.outbox);

    this.logger.log(`Production order ${orderId} completed`);
  }
}
