import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type { LotMovedPayload } from '../../domain/material-lot.aggregate';

@Injectable()
export class LotMovedHandler {
  private readonly logger = new Logger(LotMovedHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope<LotMovedPayload>): Promise<void> {
    const { id: eventId, data } = envelope;
    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;

    await this.prisma.$transaction([
      this.prisma.lotProjection.update({
        where: { lotId: data.lotId },
        data: { locationId: data.toLocationId, updatedAt: new Date() },
      }),
      this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
    ]);
    this.logger.debug(`Lot ${data.lotId} projection updated → location ${data.toLocationId}`);
  }
}
