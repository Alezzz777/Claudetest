import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { ProductionScheduleAggregate } from '../../domain/production-schedule.aggregate';

export class RescheduleEntryCommand {
  constructor(
    public readonly scheduleId: string,
    public readonly entryId: string,
    public readonly newStartAt: Date,
    public readonly newEndAt: Date,
    public readonly reason: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(RescheduleEntryCommand)
export class RescheduleEntryHandler
  implements ICommandHandler<RescheduleEntryCommand, void>
{
  private readonly logger = new Logger(RescheduleEntryHandler.name);

  constructor(private readonly eventStore: EventStoreRepository) {}

  async execute(cmd: RescheduleEntryCommand): Promise<void> {
    const events = await this.eventStore.load(cmd.scheduleId);
    const aggregate = ProductionScheduleAggregate.rehydrate(events);

    aggregate.rescheduleEntry({
      entryId: cmd.entryId,
      newStartAt: cmd.newStartAt,
      newEndAt: cmd.newEndAt,
      reason: cmd.reason,
      correlationId: cmd.correlationId,
    });

    const uncommitted = aggregate.popUncommittedEvents();
    await this.eventStore.save(cmd.scheduleId, uncommitted, aggregate.sequence);

    this.logger.log(`Entry ${cmd.entryId} rescheduled in schedule ${cmd.scheduleId}`);
  }
}
