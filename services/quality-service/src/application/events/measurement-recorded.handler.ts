import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type { QualityMeasurementRecordedPayload } from '../../domain/quality-plan.aggregate';

/**
 * Idempotent handler: updates quality_plan_projections when a measurement arrives.
 */
@Injectable()
export class MeasurementRecordedHandler {
  private readonly logger = new Logger(MeasurementRecordedHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope<QualityMeasurementRecordedPayload>): Promise<void> {
    const { id: eventId, data } = envelope;

    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;

    await this.prisma.$transaction([
      this.prisma.qualityPlanProjection.upsert({
        where: { planId: data.planId },
        update: {
          totalMeasurements: { increment: 1 },
          passCount: data.result === 'PASS' ? { increment: 1 } : undefined,
          failCount: data.result === 'FAIL' ? { increment: 1 } : undefined,
          updatedAt: new Date(),
        },
        create: {
          planId: data.planId,
          orderId: data.orderId,
          totalMeasurements: 1,
          passCount: data.result === 'PASS' ? 1 : 0,
          failCount: data.result === 'FAIL' ? 1 : 0,
          ncrCount: 0,
        },
      }),
      this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
    ]);

    this.logger.debug(`Projection updated for quality plan ${data.planId}`);
  }
}
