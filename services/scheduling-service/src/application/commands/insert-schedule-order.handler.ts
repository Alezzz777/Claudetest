import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { ProductionScheduleAggregate } from '../../domain/production-schedule.aggregate';

export class InsertScheduleOrderCommand {
  constructor(
    public readonly scheduleId: string,
    public readonly orderId: string,
    public readonly workCenterId: string,
    public readonly priority: number,
    public readonly plannedStartAt: Date,
    public readonly plannedEndAt: Date,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(InsertScheduleOrderCommand)
export class InsertScheduleOrderHandler
  implements ICommandHandler<InsertScheduleOrderCommand, void>
{
  private readonly logger = new Logger(InsertScheduleOrderHandler.name);

  constructor(private readonly eventStore: EventStoreRepository) {}

  async execute(cmd: InsertScheduleOrderCommand): Promise<void> {
    const events = await this.eventStore.load(cmd.scheduleId);
    const aggregate = ProductionScheduleAggregate.rehydrate(events);

    aggregate.insertOrder({
      orderId: cmd.orderId,
      workCenterId: cmd.workCenterId,
      priority: cmd.priority,
      plannedStartAt: cmd.plannedStartAt,
      plannedEndAt: cmd.plannedEndAt,
      correlationId: cmd.correlationId,
    });

    const uncommitted = aggregate.popUncommittedEvents();
    await this.eventStore.save(cmd.scheduleId, uncommitted, aggregate.sequence);

    this.logger.log(`Order ${cmd.orderId} inserted into schedule ${cmd.scheduleId}`);
  }
}
