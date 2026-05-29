import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { OutboxPublisher } from '../../infrastructure/persistence/outbox.publisher';
import { ProductionOrderAggregate } from '../../domain/production-order.aggregate';

// ─── Command ──────────────────────────────────────────────────────────────────

export class CancelProductionOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly reason: string,
    public readonly cancelledBy: string,
    public readonly correlationId: string,
  ) {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@CommandHandler(CancelProductionOrderCommand)
export class CancelProductionOrderHandler
  implements ICommandHandler<CancelProductionOrderCommand>
{
  private readonly logger = new Logger(CancelProductionOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository)
    private readonly eventStore: EventStoreRepository,
    @Inject(OutboxPublisher)
    private readonly outbox: OutboxPublisher,
  ) {}

  async execute(command: CancelProductionOrderCommand): Promise<void> {
    const { orderId, reason, cancelledBy, correlationId } = command;

    this.logger.log(`Cancelling production order ${orderId}`);

    const events = await this.eventStore.load(orderId);
    const order = ProductionOrderAggregate.rehydrate(events);

    if (order.status === 'COMPLETED') {
      throw new Error(`Cannot cancel a COMPLETED order`);
    }
    if (order.status === 'CANCELLED') {
      this.logger.log(`Order ${orderId} is already cancelled`);
      return;
    }

    const event = createEventEnvelope({
      type: MesEventType.PRODUCTION_ORDER_CANCELLED,
      source: 'urn:mes:production-service:ProductionOrder',
      aggregateId: orderId,
      aggregateType: 'ProductionOrder',
      sequence: order.sequence + 1,
      data: { orderId, reason, cancelledBy, cancelledAt: new Date().toISOString() },
      correlationId,
    });

    order.apply(event);
    const newEvents = order.popUncommittedEvents();

    await this.eventStore.saveWithOutbox(orderId, order.sequence, newEvents, this.outbox);

    this.logger.log(`Production order ${orderId} cancelled`);
  }
}
