import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ProductionScheduleAggregate } from '../../domain/production-schedule.aggregate';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';

export class InsertScheduleOrderCommand {
  constructor(
    public readonly scheduleId: string,
    public readonly orderId: string,
    public readonly workCenterId: string,
    public readonly priority: number,
    public readonly plannedStartAt: Date,
    public readonly plannedEndAt: Date,
    public readonly insertedBy: string,
    public readonly correlationId: string,
  ) {}
}

@CommandHandler(InsertScheduleOrderCommand)
export class InsertScheduleOrderHandler implements ICommandHandler<InsertScheduleOrderCommand, string> {
  private readonly logger = new Logger(InsertScheduleOrderHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: InsertScheduleOrderCommand): Promise<string> {
    const rows = await this.prisma.eventStore.findMany({ where: { aggregateId: cmd.scheduleId }, orderBy: { sequence: 'asc' } });
    const schedule = ProductionScheduleAggregate.rehydrate(rows.map((r) => r.payload as unknown as EventEnvelope));
    const entryId = schedule.insertOrder({ orderId: cmd.orderId, workCenterId: cmd.workCenterId, priority: cmd.priority, plannedStartAt: cmd.plannedStartAt, plannedEndAt: cmd.plannedEndAt, insertedBy: cmd.insertedBy, correlationId: cmd.correlationId });
    const newEvents = schedule.popUncommittedEvents();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.createMany({ data: newEvents.map((e) => ({ id: e.id, aggregateId: e.aggregateId, aggregateType: e.aggregateType, eventType: e.type, sequence: e.sequence, payload: e as unknown as Record<string, unknown>, correlationId: e.correlationId, causationId: e.causationId ?? null, createdAt: new Date(e.time) })) });
      await tx.outbox.createMany({ data: newEvents.map((e) => ({ id: `${e.id}-outbox`, eventType: e.type, aggregateType: e.aggregateType, aggregateId: e.aggregateId, payload: e as unknown as Record<string, unknown>, topic: e.type, partitionKey: envelopeToKafkaKey(e), status: OutboxStatus.PENDING, attempts: 0, createdAt: new Date(), processedAt: null, lastError: null })) });
    });
    this.logger.log(`Order ${cmd.orderId} inserted into schedule ${cmd.scheduleId} as entry ${entryId}`);
    return entryId;
  }
}
