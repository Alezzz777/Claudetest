import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

/**
 * DeviceProjectionHandler — handles integration device online/offline events
 * from Kafka and updates the DeviceProjection read model.
 * Implements idempotency via ProcessedEvent deduplication.
 */
@Injectable()
export class DeviceProjectionHandler {
  private readonly logger = new Logger(DeviceProjectionHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope<{ deviceId: string; protocol?: string; onlineAt?: string; timestamp?: string }>): Promise<void> {
    const { id: eventId, type, data } = envelope;

    // Idempotency check
    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;

    if (type === MesEventType.INTEGRATION_DEVICE_ONLINE) {
      await this.prisma.$transaction([
        this.prisma.deviceProjection.upsert({
          where: { deviceId: data.deviceId },
          update: {
            status: 'ONLINE',
            lastSeenAt: new Date(data.onlineAt ?? data.timestamp ?? new Date()),
            updatedAt: new Date(),
          },
          create: {
            deviceId: data.deviceId,
            status: 'ONLINE',
            protocol: data.protocol ?? 'UNKNOWN',
            lastSeenAt: new Date(data.onlineAt ?? data.timestamp ?? new Date()),
          },
        }),
        this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
      ]);
      this.logger.debug(`Device ${data.deviceId} marked ONLINE`);
    } else if (type === MesEventType.INTEGRATION_DEVICE_OFFLINE) {
      await this.prisma.$transaction([
        this.prisma.deviceProjection.upsert({
          where: { deviceId: data.deviceId },
          update: { status: 'OFFLINE', updatedAt: new Date() },
          create: {
            deviceId: data.deviceId,
            status: 'OFFLINE',
            protocol: data.protocol ?? 'UNKNOWN',
          },
        }),
        this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
      ]);
      this.logger.debug(`Device ${data.deviceId} marked OFFLINE`);
    }
  }
}
