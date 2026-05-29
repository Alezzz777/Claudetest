import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { QualityPlanAggregate } from '../../domain/quality-plan.aggregate';

export class ActivateQualityPlanCommand {
  constructor(
    public readonly planId: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(ActivateQualityPlanCommand)
export class ActivateQualityPlanHandler implements ICommandHandler<ActivateQualityPlanCommand, void> {
  private readonly logger = new Logger(ActivateQualityPlanHandler.name);

  constructor(
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: ActivateQualityPlanCommand): Promise<void> {
    const events = await this.eventStore.load(cmd.planId);
    if (events.length === 0) {
      throw new NotFoundException(`Quality plan ${cmd.planId} not found`);
    }

    const plan = QualityPlanAggregate.rehydrate(events);
    const expectedVersion = plan.sequence;

    plan.activate(cmd.correlationId);

    const newEvents = plan.popUncommittedEvents();
    await this.eventStore.save(plan.id, newEvents, expectedVersion);

    this.logger.log(`Quality plan ${cmd.planId} activated`);
  }
}
