import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { MaterialLotAggregate } from '../../domain/material-lot.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';

export class ReserveLotCommand {
  constructor(
    public readonly lotId: string,
    public readonly orderId: string,
    public readonly qty: number,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(ReserveLotCommand)
export class ReserveLotHandler implements ICommandHandler<ReserveLotCommand, void> {
  private readonly logger = new Logger(ReserveLotHandler.name);

  constructor(private readonly repo: EventStoreRepository) {}

  async execute(cmd: ReserveLotCommand): Promise<void> {
    const events = await this.repo.load(cmd.lotId);
    const agg = MaterialLotAggregate.rehydrate(events);
    agg.reserve(cmd.orderId, cmd.qty, cmd.correlationId);
    const newEvents = agg.popUncommittedEvents();
    await this.repo.save(agg.id, newEvents, agg.sequence);
    this.logger.log(`Lot ${cmd.lotId} reserved for order ${cmd.orderId}`);
  }
}
