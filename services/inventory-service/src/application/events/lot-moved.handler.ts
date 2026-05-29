import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope, IdempotentEventHandler, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type {
  LotCreatedPayload,
  LotReservedPayload,
  LotReleasedPayload,
  LotMovedPayload,
  LotConsumedPayload,
} from '../../domain/material-lot.aggregate';

@Injectable()
export class LotProjectionHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(LotProjectionHandler.name);

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

  async handle(event: EventEnvelope<unknown>): Promise<void> {
    switch (event.type) {
      case MesEventType.INVENTORY_LOT_CREATED:
        await this.onLotCreated(event as EventEnvelope<LotCreatedPayload>);
        break;
      case MesEventType.INVENTORY_RESERVATION_CREATED:
        await this.onLotReserved(event as EventEnvelope<LotReservedPayload>);
        break;
      case MesEventType.INVENTORY_RESERVATION_FULFILLED:
        await this.onLotReleased(event as EventEnvelope<LotReleasedPayload>);
        break;
      case MesEventType.INVENTORY_LOT_MOVED:
        await this.onLotMoved(event as EventEnvelope<LotMovedPayload>);
        break;
      case MesEventType.INVENTORY_LOT_CONSUMED:
        await this.onLotConsumed(event as EventEnvelope<LotConsumedPayload>);
        break;
      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  private async onLotCreated(event: EventEnvelope<LotCreatedPayload>): Promise<void> {
    const d = event.data;
    await this.prisma.lotProjection.create({
      data: {
        lotId: d.lotId,
        lotNo: d.lotNo,
        materialCode: d.materialCode,
        quantity: d.quantity,
        reservedQty: 0,
        locationId: d.locationId,
        status: 'AVAILABLE',
        tenantId: d.tenantId,
        createdAt: new Date(d.createdAt),
      },
    });
    this.logger.debug(`LotProjection created for lot ${d.lotId}`);
  }

  private async onLotReserved(event: EventEnvelope<LotReservedPayload>): Promise<void> {
    const d = event.data;
    await this.prisma.lotProjection.update({
      where: { lotId: d.lotId },
      data: {
        reservedQty: { increment: d.qty },
        status: 'RESERVED',
      },
    });
    this.logger.debug(`LotProjection reserved for lot ${d.lotId}`);
  }

  private async onLotReleased(event: EventEnvelope<LotReleasedPayload>): Promise<void> {
    const d = event.data;
    const lot = await this.prisma.lotProjection.findUnique({ where: { lotId: d.lotId } });
    if (!lot) return;
    await this.prisma.lotProjection.update({
      where: { lotId: d.lotId },
      data: {
        reservedQty: Math.max(0, lot.reservedQty - 0), // reset to 0
        status: 'AVAILABLE',
      },
    });
    await this.prisma.lotProjection.update({
      where: { lotId: d.lotId },
      data: { reservedQty: 0, status: 'AVAILABLE' },
    });
    this.logger.debug(`LotProjection released for lot ${d.lotId}`);
  }

  private async onLotMoved(event: EventEnvelope<LotMovedPayload>): Promise<void> {
    const d = event.data;
    await this.prisma.lotProjection.update({
      where: { lotId: d.lotId },
      data: { locationId: d.toLocationId, status: 'MOVED' },
    });
    this.logger.debug(`LotProjection moved for lot ${d.lotId}`);
  }

  private async onLotConsumed(event: EventEnvelope<LotConsumedPayload>): Promise<void> {
    const d = event.data;
    await this.prisma.lotProjection.update({
      where: { lotId: d.lotId },
      data: {
        quantity: d.remainingQuantity,
        status: d.remainingQuantity === 0 ? 'CONSUMED' : 'AVAILABLE',
      },
    });
    // Upsert WipProjection
    const lot = await this.prisma.lotProjection.findUnique({ where: { lotId: d.lotId } });
    if (lot) {
      await this.prisma.wipProjection.upsert({
        where: { orderId: d.orderId },
        create: {
          orderId: d.orderId,
          materialCode: lot.materialCode,
          quantity: d.qty,
          locationId: lot.locationId,
        },
        update: {
          quantity: { increment: d.qty },
          locationId: lot.locationId,
        },
      });
    }
    this.logger.debug(`LotProjection consumed for lot ${d.lotId}`);
  }
}

// Keep old name as alias for backward compatibility
export { LotProjectionHandler as LotMovedHandler };
