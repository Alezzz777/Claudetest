import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';
import { EdgeModeService } from '../../infrastructure/edge/edge-mode.service';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { v4 as uuidv4 } from 'uuid';

export class ProcessTelemetryCommand {
  constructor(
    public readonly deviceId: string,
    public readonly protocol: string,
    public readonly metric: string,
    public readonly value: number,
    public readonly uom: string,
    public readonly timestamp: Date,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(ProcessTelemetryCommand)
export class ProcessTelemetryHandler implements ICommandHandler<ProcessTelemetryCommand> {
  private readonly logger = new Logger(ProcessTelemetryHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KafkaProducerService) private readonly kafka: KafkaProducerService,
    private readonly edgeMode: EdgeModeService,
  ) {}

  async execute(cmd: ProcessTelemetryCommand): Promise<void> {
    const envelope = createEventEnvelope({
      type: MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
      source: `urn:mes:integration-service:${cmd.protocol}`,
      aggregateId: cmd.deviceId,
      aggregateType: 'Device',
      sequence: 1,
      correlationId: cmd.correlationId,
      data: {
        deviceId: cmd.deviceId,
        metric: cmd.metric,
        value: cmd.value,
        uom: cmd.uom,
        timestamp: cmd.timestamp.toISOString(),
        protocol: cmd.protocol,
      },
    });

    const topic = 'mes.uns.telemetry';
    const key = cmd.deviceId;
    const payload = JSON.stringify(envelope);

    if (this.edgeMode.isEdge()) {
      await this.edgeMode.bufferEvent(topic, key, envelope as unknown as object);
    } else {
      await this.kafka.publish(topic, key, payload);
    }

    // Upsert DeviceProjection
    try {
      await this.prisma.deviceProjection.upsert({
        where: { deviceId: cmd.deviceId },
        update: { lastSeenAt: cmd.timestamp, updatedAt: new Date() },
        create: {
          deviceId: cmd.deviceId,
          status: 'ONLINE',
          protocol: cmd.protocol,
          lastSeenAt: cmd.timestamp,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to upsert device projection: ${err}`);
    }

    this.logger.debug(`Telemetry processed for device ${cmd.deviceId}: ${cmd.metric}=${cmd.value}`);
  }
}
