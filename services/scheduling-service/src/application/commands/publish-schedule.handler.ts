import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { ProductionScheduleAggregate } from '../../domain/production-schedule.aggregate';

export class PublishScheduleCommand {
  constructor(
    public readonly scheduleId: string,
    public readonly publishedBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(PublishScheduleCommand)
export class PublishScheduleHandler
  implements ICommandHandler<PublishScheduleCommand, void>
{
  private readonly logger = new Logger(PublishScheduleHandler.name);

  constructor(private readonly eventStore: EventStoreRepository) {}

  async execute(cmd: PublishScheduleCommand): Promise<void> {
    const events = await this.eventStore.load(cmd.scheduleId);
    const aggregate = ProductionScheduleAggregate.rehydrate(events);

    aggregate.publish(cmd.publishedBy, cmd.correlationId);

    const uncommitted = aggregate.popUncommittedEvents();
    await this.eventStore.save(cmd.scheduleId, uncommitted, aggregate.sequence);

    this.logger.log(`Schedule ${cmd.scheduleId} published by ${cmd.publishedBy}`);
  }
}
