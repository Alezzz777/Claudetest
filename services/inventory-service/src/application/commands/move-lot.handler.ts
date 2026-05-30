import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { MaterialLotAggregate } from '../../domain/material-lot.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';

export class MoveLotCommand {
  constructor(
    public readonly lotId: string,
    public readonly toLocationId: string,
    public readonly movedBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(MoveLotCommand)
export class MoveLotHandler implements ICommandHandler<MoveLotCommand, void> {
  private readonly logger = new Logger(MoveLotHandler.name);

  constructor(private readonly repo: EventStoreRepository) {}

  async execute(cmd: MoveLotCommand): Promise<void> {
    const events = await this.repo.load(cmd.lotId);
    const agg = MaterialLotAggregate.rehydrate(events);
    agg.move(cmd.toLocationId, cmd.movedBy, cmd.correlationId);
    const newEvents = agg.popUncommittedEvents();
    await this.repo.save(agg.id, newEvents, agg.sequence);
    this.logger.log(`Lot ${cmd.lotId} moved to ${cmd.toLocationId}`);
  }
}
