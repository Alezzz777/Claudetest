import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { OutboxPublisher } from '../../infrastructure/persistence/outbox.publisher';
import { ProductionOrderAggregate } from '../../domain/production-order.aggregate';

// ─── Command ──────────────────────────────────────────────────────────────────

export class StartProductionOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly operatorId: string,
    public readonly correlationId: string,
  ) {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@CommandHandler(StartProductionOrderCommand)
export class StartProductionOrderHandler
  implements ICommandHandler<StartProductionOrderCommand>
{
  private readonly logger = new Logger(StartProductionOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository)
    private readonly eventStore: EventStoreRepository,
    @Inject(OutboxPublisher)
    private readonly outbox: OutboxPublisher,
  ) {}

  async execute(command: StartProductionOrderCommand): Promise<void> {
    const { orderId, operatorId, correlationId } = command;

    this.logger.log(`Starting production order ${orderId} by operator ${operatorId}`);

    // 1. Rehydrate aggregate from event store
    const events = await this.eventStore.load(orderId);
    const order = ProductionOrderAggregate.rehydrate(events);

    // 2. Apply domain logic — throws if business rule violated
    order.start(operatorId, correlationId);

    // 3. Get uncommitted events
    const newEvents = order.popUncommittedEvents();

    // 4. Persist events + outbox rows in a single DB transaction
    await this.eventStore.saveWithOutbox(orderId, order.sequence, newEvents, this.outbox);

    this.logger.log(
      `Production order ${orderId} started; ${newEvents.length} event(s) written`,
    );
  }
}
