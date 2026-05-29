import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { QualityPlanAggregate } from '../../domain/quality-plan.aggregate';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';

export class RecordMeasurementCommand {
  constructor(
    public readonly planId: string,
    public readonly characteristicId: string,
    public readonly characteristicName: string,
    public readonly nominalValue: number,
    public readonly lowerLimit: number,
    public readonly upperLimit: number,
    public readonly actualValue: number,
    public readonly uom: string,
    public readonly operatorId: string,
    public readonly correlationId: string,
  ) {}
}

@CommandHandler(RecordMeasurementCommand)
export class RecordMeasurementHandler implements ICommandHandler<RecordMeasurementCommand> {
  private readonly logger = new Logger(RecordMeasurementHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: RecordMeasurementCommand): Promise<void> {
    // Load event stream and rehydrate aggregate
    const rows = await this.prisma.eventStore.findMany({
      where: { aggregateId: cmd.planId },
      orderBy: { sequence: 'asc' },
    });
    const events = rows.map((r) => r.payload as unknown as EventEnvelope);
    const plan = QualityPlanAggregate.rehydrate(events);

    plan.recordMeasurement({
      characteristicId: cmd.characteristicId,
      characteristicName: cmd.characteristicName,
      nominalValue: cmd.nominalValue,
      lowerLimit: cmd.lowerLimit,
      upperLimit: cmd.upperLimit,
      actualValue: cmd.actualValue,
      uom: cmd.uom,
      operatorId: cmd.operatorId,
      correlationId: cmd.correlationId,
    });

    const newEvents = plan.popUncommittedEvents();

    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.createMany({
        data: newEvents.map((e) => ({
          id: e.id,
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          eventType: e.type,
          sequence: e.sequence,
          payload: e as unknown as Record<string, unknown>,
          correlationId: e.correlationId,
          causationId: e.causationId ?? null,
          createdAt: new Date(e.time),
        })),
      });
      await tx.outbox.createMany({
        data: newEvents.map((e) => ({
          id: `${e.id}-outbox`,
          eventType: e.type,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          payload: e as unknown as Record<string, unknown>,
          topic: e.type,
          partitionKey: envelopeToKafkaKey(e),
          status: OutboxStatus.PENDING,
          attempts: 0,
          createdAt: new Date(),
          processedAt: null,
          lastError: null,
        })),
      });
    });

    this.logger.log(`Measurement recorded for plan ${cmd.planId}; ${newEvents.length} events`);
  }
}
