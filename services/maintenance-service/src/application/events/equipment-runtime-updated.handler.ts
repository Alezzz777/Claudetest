import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type { EquipmentRuntimeUpdatedPayload } from '../../domain/equipment.aggregate';

/**
 * Idempotent handler: updates equipment_projections with the latest runtime data.
 * Runtime events arrive at high frequency from integration-service (telemetry).
 */
@Injectable()
export class EquipmentRuntimeUpdatedHandler {
  private readonly logger = new Logger(EquipmentRuntimeUpdatedHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope<EquipmentRuntimeUpdatedPayload>): Promise<void> {
    const { id: eventId, data } = envelope;
    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;

    await this.prisma.$transaction([
      this.prisma.equipmentProjection.upsert({
        where: { equipmentId: data.equipmentId },
        update: { runtimeHours: data.cumulativeRuntimeHours, cycleCount: data.cycleCount, updatedAt: new Date() },
        create: { equipmentId: data.equipmentId, name: data.equipmentId, status: 'RUNNING', runtimeHours: data.cumulativeRuntimeHours, cycleCount: data.cycleCount, openWorkOrders: 0, nextPmDue: null },
      }),
      this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
    ]);

    this.logger.debug(`Equipment ${data.equipmentId} runtime updated to ${data.cumulativeRuntimeHours}h`);
  }
}
