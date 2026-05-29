import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { MaterialLotAggregate } from '../../domain/material-lot.aggregate';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';

export class MoveLotCommand {
  constructor(
    public readonly lotId: string,
    public readonly toLocationId: string,
    public readonly quantity: number,
    public readonly movedBy: string,
    public readonly reason: string,
    public readonly correlationId: string,
  ) {}
}

@CommandHandler(MoveLotCommand)
export class MoveLotHandler implements ICommandHandler<MoveLotCommand> {
  private readonly logger = new Logger(MoveLotHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: MoveLotCommand): Promise<void> {
    const rows = await this.prisma.eventStore.findMany({ where: { aggregateId: cmd.lotId }, orderBy: { sequence: 'asc' } });
    const lot = MaterialLotAggregate.rehydrate(rows.map((r) => r.payload as unknown as EventEnvelope));
    lot.move(cmd.toLocationId, cmd.quantity, cmd.movedBy, cmd.reason, cmd.correlationId);
    const newEvents = lot.popUncommittedEvents();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.createMany({ data: newEvents.map((e) => ({ id: e.id, aggregateId: e.aggregateId, aggregateType: e.aggregateType, eventType: e.type, sequence: e.sequence, payload: e as unknown as Record<string, unknown>, correlationId: e.correlationId, causationId: e.causationId ?? null, createdAt: new Date(e.time) })) });
      await tx.outbox.createMany({ data: newEvents.map((e) => ({ id: `${e.id}-outbox`, eventType: e.type, aggregateType: e.aggregateType, aggregateId: e.aggregateId, payload: e as unknown as Record<string, unknown>, topic: e.type, partitionKey: envelopeToKafkaKey(e), status: OutboxStatus.PENDING, attempts: 0, createdAt: new Date(), processedAt: null, lastError: null })) });
    });
    this.logger.log(`Lot ${cmd.lotId} moved to ${cmd.toLocationId}`);
  }
}
