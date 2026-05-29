import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope, MesEventType, IdempotentEventHandler } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

/**
 * Projection handler that updates read-model tables from quality domain events.
 * Extends IdempotentEventHandler to guarantee exactly-once processing.
 */
@Injectable()
export class MeasurementRecordedHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(MeasurementRecordedHandler.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    return row !== null;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } });
  }

  async handle(envelope: EventEnvelope<unknown>): Promise<void> {
    switch (envelope.type) {
      case MesEventType.QUALITY_MEASUREMENT_RECORDED:
        await this.handleMeasurementRecorded(envelope);
        break;
      case MesEventType.QUALITY_NCR_RAISED:
        await this.handleNcrRaised(envelope);
        break;
      case MesEventType.QUALITY_NCR_DISPOSITIONED:
        await this.handleNcrDispositioned(envelope);
        break;
      case MesEventType.QUALITY_PLAN_CREATED:
        await this.handleQualityPlanCreated(envelope);
        break;
      case MesEventType.QUALITY_PLAN_ACTIVATED:
        await this.handleQualityPlanActivated(envelope);
        break;
      default:
        this.logger.debug(`Unhandled event type: ${envelope.type}`);
    }
  }

  private async handleMeasurementRecorded(envelope: EventEnvelope<unknown>): Promise<void> {
    const d = envelope.data as {
      measurementId: string;
      orderId: string;
      operationId: string;
      parameterId: string;
      value: number;
      lsl: number;
      usl: number;
      inSpec: boolean;
      recordedBy: string;
      recordedAt: string;
    };
    await this.prisma.measurementProjection.upsert({
      where: { id: d.measurementId },
      create: {
        id: d.measurementId,
        orderId: d.orderId,
        operationId: d.operationId,
        parameterId: d.parameterId,
        value: d.value,
        lsl: d.lsl,
        usl: d.usl,
        inSpec: d.inSpec,
        recordedBy: d.recordedBy,
        recordedAt: new Date(d.recordedAt),
      },
      update: {
        value: d.value,
        inSpec: d.inSpec,
      },
    });
    this.logger.debug(`MeasurementProjection upserted for ${d.measurementId}`);
  }

  private async handleNcrRaised(envelope: EventEnvelope<unknown>): Promise<void> {
    const d = envelope.data as {
      ncId: string;
      orderId: string;
      lotId?: string;
      description: string;
      raisedBy: string;
      raisedAt: string;
    };
    await this.prisma.nonConformanceProjection.upsert({
      where: { ncId: d.ncId },
      create: {
        ncId: d.ncId,
        orderId: d.orderId,
        lotId: d.lotId ?? null,
        description: d.description,
        status: 'OPEN',
        raisedBy: d.raisedBy,
        raisedAt: new Date(d.raisedAt),
      },
      update: {
        description: d.description,
        status: 'OPEN',
      },
    });
    this.logger.debug(`NonConformanceProjection created for ${d.ncId}`);
  }

  private async handleNcrDispositioned(envelope: EventEnvelope<unknown>): Promise<void> {
    const d = envelope.data as {
      ncId: string;
      closedAt: string;
    };
    await this.prisma.nonConformanceProjection.update({
      where: { ncId: d.ncId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(d.closedAt),
      },
    });
    this.logger.debug(`NonConformanceProjection closed for ${d.ncId}`);
  }

  private async handleQualityPlanCreated(envelope: EventEnvelope<unknown>): Promise<void> {
    const d = envelope.data as {
      planId: string;
      productCode: string;
      specs: unknown;
      createdAt: string;
    };
    await this.prisma.qualityPlanProjection.upsert({
      where: { planId: d.planId },
      create: {
        planId: d.planId,
        productCode: d.productCode,
        status: 'DRAFT',
        specJson: d.specs as object,
        createdAt: new Date(d.createdAt),
      },
      update: {
        productCode: d.productCode,
        specJson: d.specs as object,
      },
    });
    this.logger.debug(`QualityPlanProjection created for ${d.planId}`);
  }

  private async handleQualityPlanActivated(envelope: EventEnvelope<unknown>): Promise<void> {
    const d = envelope.data as { planId: string };
    await this.prisma.qualityPlanProjection.update({
      where: { planId: d.planId },
      data: { status: 'ACTIVE' },
    });
    this.logger.debug(`QualityPlanProjection activated for ${d.planId}`);
  }
}
