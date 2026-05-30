import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { ProductionScheduleAggregate } from '../../domain/production-schedule.aggregate';

export class CancelScheduleEntryCommand {
  constructor(
    public readonly scheduleId: string,
    public readonly entryId: string,
    public readonly reason: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CancelScheduleEntryCommand)
export class CancelScheduleEntryHandler
  implements ICommandHandler<CancelScheduleEntryCommand, void>
{
  private readonly logger = new Logger(CancelScheduleEntryHandler.name);

  constructor(private readonly eventStore: EventStoreRepository) {}

  async execute(cmd: CancelScheduleEntryCommand): Promise<void> {
    const events = await this.eventStore.load(cmd.scheduleId);
    const aggregate = ProductionScheduleAggregate.rehydrate(events);

    aggregate.cancelEntry({
      entryId: cmd.entryId,
      reason: cmd.reason,
      correlationId: cmd.correlationId,
    });

    const uncommitted = aggregate.popUncommittedEvents();
    if (uncommitted.length > 0) {
      await this.eventStore.save(cmd.scheduleId, uncommitted, aggregate.sequence);
    }

    this.logger.log(`Entry ${cmd.entryId} cancelled in schedule ${cmd.scheduleId}`);
  }
}
