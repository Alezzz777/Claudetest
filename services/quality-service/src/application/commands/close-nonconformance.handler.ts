import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { NonConformanceAggregate } from '../../domain/nonconformance.aggregate';

export class CloseNonConformanceCommand {
  constructor(
    public readonly ncId: string,
    public readonly closedBy: string,
    public readonly resolution: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CloseNonConformanceCommand)
export class CloseNonConformanceHandler implements ICommandHandler<CloseNonConformanceCommand, void> {
  private readonly logger = new Logger(CloseNonConformanceHandler.name);

  constructor(
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: CloseNonConformanceCommand): Promise<void> {
    const events = await this.eventStore.load(cmd.ncId);
    if (events.length === 0) {
      throw new NotFoundException(`Non-conformance ${cmd.ncId} not found`);
    }

    const nc = NonConformanceAggregate.rehydrate(events);
    const expectedVersion = nc.sequence;

    nc.close(cmd.closedBy, cmd.resolution, cmd.correlationId);

    const newEvents = nc.popUncommittedEvents();
    if (newEvents.length > 0) {
      await this.eventStore.save(nc.id, newEvents, expectedVersion);
    }

    this.logger.log(`Non-conformance ${cmd.ncId} closed by ${cmd.closedBy}`);
  }
}
