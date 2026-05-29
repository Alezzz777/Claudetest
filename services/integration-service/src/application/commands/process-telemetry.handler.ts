import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';
import { createEventEnvelope, MesEventType } from '@mes/shared';

export class ProcessTelemetryCommand {
  constructor(
    public readonly equipmentId: string,
    public readonly metric: string,
    public readonly value: number,
    public readonly uom: string,
    public readonly timestamp: Date,
    public readonly protocol: string,
  ) {}
}

@CommandHandler(ProcessTelemetryCommand)
export class ProcessTelemetryHandler implements ICommandHandler<ProcessTelemetryCommand> {
  private readonly logger = new Logger(ProcessTelemetryHandler.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KafkaProducerService) private readonly kafka: KafkaProducerService,
  ) {}

  async execute(cmd: ProcessTelemetryCommand): Promise<void> {
    const envelope = createEventEnvelope({
      type: MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
      source: `urn:mes:integration-service:${cmd.protocol}`,
      aggregateId: cmd.equipmentId,
      aggregateType: 'Equipment',
      sequence: 1,
      data: { equipmentId: cmd.equipmentId, metric: cmd.metric, value: cmd.value, uom: cmd.uom, timestamp: cmd.timestamp.toISOString(), protocol: cmd.protocol },
    });
    await this.kafka.publish(MesEventType.INTEGRATION_TELEMETRY_RECEIVED, `Equipment:${cmd.equipmentId}`, JSON.stringify(envelope));
    this.logger.debug(`Telemetry published for equipment ${cmd.equipmentId}: ${cmd.metric}=${cmd.value}`);
  }
}
