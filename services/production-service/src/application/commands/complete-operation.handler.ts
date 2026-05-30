import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { OutboxPublisher } from '../../infrastructure/persistence/outbox.publisher';
import { ProductionOrderAggregate } from '../../domain/production-order.aggregate';

// ─── Command ──────────────────────────────────────────────────────────────────

export class CompleteOperationCommand {
  constructor(
    public readonly orderId: string,
    public readonly operationId: string,
    public readonly operationNo: number,
    public readonly completedQty: number,
    public readonly scrapQty: number,
    public readonly operatorId: string,
    public readonly correlationId: string,
  ) {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@CommandHandler(CompleteOperationCommand)
export class CompleteOperationHandler
  implements ICommandHandler<CompleteOperationCommand>
{
  private readonly logger = new Logger(CompleteOperationHandler.name);

  constructor(
    @Inject(EventStoreRepository)
    private readonly eventStore: EventStoreRepository,
    @Inject(OutboxPublisher)
    private readonly outbox: OutboxPublisher,
  ) {}

  async execute(command: CompleteOperationCommand): Promise<void> {
    const { orderId, operationId, operationNo, completedQty, scrapQty, operatorId, correlationId } = command;

    this.logger.log(`Completing operation ${operationId} for order ${orderId}`);

    const events = await this.eventStore.load(orderId);
    const order = ProductionOrderAggregate.rehydrate(events);

    order.completeOperation({
      operationId,
      operationNo,
      completedQty,
      scrapQty,
      operatorId,
      correlationId,
    });

    const newEvents = order.popUncommittedEvents();

    await this.eventStore.saveWithOutbox(orderId, order.sequence, newEvents, this.outbox);

    this.logger.log(`Operation ${operationId} completed for order ${orderId}`);
  }
}
