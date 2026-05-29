import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { createEventEnvelope, MesEventType, envelopeToKafkaKey } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { QualityPlanAggregate } from '../../domain/quality-plan.aggregate';
import { NonConformanceAggregate } from '../../domain/nonconformance.aggregate';

export class RecordMeasurementCommand {
  constructor(
    public readonly orderId: string,
    public readonly operationId: string,
    public readonly planId: string,
    public readonly parameterId: string,
    public readonly value: number,
    public readonly recordedBy: string,
    public readonly correlationId?: string,
  ) {}
}

export interface RecordMeasurementResult {
  inSpec: boolean;
  nonConformanceId?: string;
}

@CommandHandler(RecordMeasurementCommand)
export class RecordMeasurementHandler implements ICommandHandler<RecordMeasurementCommand, RecordMeasurementResult> {
  private readonly logger = new Logger(RecordMeasurementHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: RecordMeasurementCommand): Promise<RecordMeasurementResult> {
    // Load quality plan
    const planEvents = await this.eventStore.load(cmd.planId);
    if (planEvents.length === 0) {
      throw new NotFoundException(`Quality plan ${cmd.planId} not found`);
    }
    const plan = QualityPlanAggregate.rehydrate(planEvents);

    // Validate measurement against spec
    const { inSpec, lsl, usl } = plan.validate(cmd.value, cmd.parameterId);

    const measurementId = uuidv4();
    const correlationId = cmd.correlationId ?? uuidv4();

    // Build measurement event
    const measurementEvent = createEventEnvelope({
      type: MesEventType.QUALITY_MEASUREMENT_RECORDED,
      source: 'urn:mes:quality-service:Measurement',
      aggregateId: measurementId,
      aggregateType: 'Measurement',
      sequence: 1,
      data: {
        measurementId,
        orderId: cmd.orderId,
        operationId: cmd.operationId,
        planId: cmd.planId,
        parameterId: cmd.parameterId,
        value: cmd.value,
        lsl,
        usl,
        inSpec,
        recordedBy: cmd.recordedBy,
        recordedAt: new Date().toISOString(),
      },
      correlationId,
    });

    // Save measurement event via transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.create({
        data: {
          id: measurementEvent.id,
          aggregateId: measurementEvent.aggregateId,
          aggregateType: measurementEvent.aggregateType,
          eventType: measurementEvent.type,
          sequence: measurementEvent.sequence,
          payload: measurementEvent as unknown as Record<string, unknown>,
          correlationId: measurementEvent.correlationId ?? null,
          createdAt: new Date(measurementEvent.time),
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: measurementEvent.type,
          partitionKey: envelopeToKafkaKey(measurementEvent),
          payload: measurementEvent as unknown as Record<string, unknown>,
          sent: false,
          createdAt: new Date(),
        },
      });
    });

    let nonConformanceId: string | undefined;

    if (!inSpec) {
      // Auto-open NonConformance
      const nc = NonConformanceAggregate.open({
        orderId: cmd.orderId,
        description: `Out-of-spec measurement for parameter ${cmd.parameterId}: value=${cmd.value} (lsl=${lsl}, usl=${usl})`,
        raisedBy: cmd.recordedBy,
        correlationId,
      });
      nonConformanceId = nc.id;
      const ncEvents = nc.popUncommittedEvents();

      // Save NC events (includes outbox entries)
      await this.eventStore.save(nc.id, ncEvents, 0);

      // Emit QUALITY_HOLD_PLACED (batch blocked) event
      const holdEvent = createEventEnvelope({
        type: MesEventType.QUALITY_HOLD_PLACED,
        source: 'urn:mes:quality-service:Measurement',
        aggregateId: cmd.orderId,
        aggregateType: 'ProductionOrder',
        sequence: 1,
        data: {
          orderId: cmd.orderId,
          ncId: nonConformanceId,
          reason: `Non-conformance ${nonConformanceId} raised for out-of-spec measurement`,
          blockedAt: new Date().toISOString(),
        },
        correlationId,
      });

      await this.prisma.outboxEvent.create({
        data: {
          topic: holdEvent.type,
          partitionKey: envelopeToKafkaKey(holdEvent),
          payload: holdEvent as unknown as Record<string, unknown>,
          sent: false,
          createdAt: new Date(),
        },
      });
    }

    this.logger.log(`Measurement ${measurementId} recorded for order ${cmd.orderId}, inSpec=${inSpec}`);
    return { inSpec, nonConformanceId };
  }
}
