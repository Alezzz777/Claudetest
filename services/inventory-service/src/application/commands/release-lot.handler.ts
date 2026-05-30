import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { MaterialLotAggregate } from '../../domain/material-lot.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';

export class ReleaseLotCommand {
  constructor(
    public readonly lotId: string,
    public readonly orderId: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(ReleaseLotCommand)
export class ReleaseLotHandler implements ICommandHandler<ReleaseLotCommand, void> {
  private readonly logger = new Logger(ReleaseLotHandler.name);

  constructor(private readonly repo: EventStoreRepository) {}

  async execute(cmd: ReleaseLotCommand): Promise<void> {
    const events = await this.repo.load(cmd.lotId);
    const agg = MaterialLotAggregate.rehydrate(events);
    agg.release(cmd.orderId, cmd.correlationId);
    const newEvents = agg.popUncommittedEvents();
    if (newEvents.length > 0) {
      await this.repo.save(agg.id, newEvents, agg.sequence);
    }
    this.logger.log(`Lot ${cmd.lotId} released for order ${cmd.orderId}`);
  }
}
