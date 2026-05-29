import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

@Injectable()
export class DeviceOnlineHandler {
  private readonly logger = new Logger(DeviceOnlineHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope<{ deviceId: string; protocol: string; onlineAt: string }>): Promise<void> {
    const { id: eventId, data } = envelope;
    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;
    await this.prisma.$transaction([
      this.prisma.deviceProjection.upsert({
        where: { deviceId: data.deviceId },
        update: { status: 'ONLINE', lastSeenAt: new Date(data.onlineAt), updatedAt: new Date() },
        create: { deviceId: data.deviceId, status: 'ONLINE', protocol: data.protocol, lastSeenAt: new Date(data.onlineAt) },
      }),
      this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
    ]);
  }
}
