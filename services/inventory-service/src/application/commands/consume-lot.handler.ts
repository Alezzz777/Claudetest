import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { MaterialLotAggregate } from '../../domain/material-lot.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';

export class ConsumeLotCommand {
  constructor(
    public readonly lotId: string,
    public readonly orderId: string,
    public readonly qty: number,
    public readonly consumedBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(ConsumeLotCommand)
export class ConsumeLotHandler implements ICommandHandler<ConsumeLotCommand, void> {
  private readonly logger = new Logger(ConsumeLotHandler.name);

  constructor(private readonly repo: EventStoreRepository) {}

  async execute(cmd: ConsumeLotCommand): Promise<void> {
    const events = await this.repo.load(cmd.lotId);
    const agg = MaterialLotAggregate.rehydrate(events);
    agg.consume(cmd.orderId, cmd.qty, cmd.consumedBy, cmd.correlationId);
    const newEvents = agg.popUncommittedEvents();
    await this.repo.save(agg.id, newEvents, agg.sequence);
    this.logger.log(`Lot ${cmd.lotId} consumed ${cmd.qty} for order ${cmd.orderId}`);
  }
}
