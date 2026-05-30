import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { WorkOrderAggregate } from '../../domain/work-order.aggregate';

export class CancelWorkOrderCommand {
  constructor(
    public readonly workOrderId: string,
    public readonly reason: string,
    public readonly cancelledBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CancelWorkOrderCommand)
export class CancelWorkOrderHandler implements ICommandHandler<CancelWorkOrderCommand, void> {
  private readonly logger = new Logger(CancelWorkOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: CancelWorkOrderCommand): Promise<void> {
    const woEvents = await this.eventStore.load(cmd.workOrderId);
    if (woEvents.length === 0) throw new NotFoundException(`Work order ${cmd.workOrderId} not found`);

    const workOrder = WorkOrderAggregate.rehydrate(woEvents);
    const expectedVersion = woEvents.length;
    workOrder.cancel(cmd.reason, cmd.cancelledBy, cmd.correlationId);

    const newEvents = workOrder.popUncommittedEvents();
    if (newEvents.length > 0) {
      await this.eventStore.save(workOrder.id, newEvents, expectedVersion);
    }

    this.logger.log(`Work order ${cmd.workOrderId} cancelled`);
  }
}
