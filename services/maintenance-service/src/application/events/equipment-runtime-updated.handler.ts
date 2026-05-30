import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope, IdempotentEventHandler, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import {
  EQUIPMENT_CREATED_TYPE,
  EQUIPMENT_RUNTIME_UPDATED_TYPE,
  EQUIPMENT_DOWN_TYPE,
  EQUIPMENT_RESTORED_TYPE,
  type EquipmentCreatedPayload,
  type EquipmentRuntimeUpdatedPayload,
  type EquipmentDownPayload,
  type EquipmentRestoredPayload,
} from '../../domain/equipment.aggregate';
import {
  WORK_ORDER_CREATED_TYPE,
  WORK_ORDER_STARTED_TYPE,
  WORK_ORDER_COMPLETED_TYPE,
  WORK_ORDER_CANCELLED_TYPE,
  type WorkOrderCreatedPayload,
  type WorkOrderStartedPayload,
  type WorkOrderCompletedPayload,
  type WorkOrderCancelledPayload,
} from '../../domain/work-order.aggregate';

/**
 * MaintenanceProjectionHandler: builds read-model projections from domain events.
 * Idempotent: skips already-processed events.
 */
@Injectable()
export class MaintenanceProjectionHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(MaintenanceProjectionHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
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
      case EQUIPMENT_CREATED_TYPE: {
        const d = envelope.data as EquipmentCreatedPayload;
        await this.prisma.equipmentProjection.upsert({
          where: { equipmentId: d.equipmentId },
          update: {},
          create: {
            equipmentId: d.equipmentId,
            name: d.name,
            workCenterId: d.workCenterId,
            status: 'AVAILABLE',
            runtimeHours: 0,
            tenantId: d.tenantId,
          },
        });
        this.logger.debug(`Equipment ${d.equipmentId} created projection`);
        break;
      }
      case EQUIPMENT_RUNTIME_UPDATED_TYPE: {
        const d = envelope.data as EquipmentRuntimeUpdatedPayload;
        await this.prisma.equipmentProjection.updateMany({
          where: { equipmentId: d.equipmentId },
          data: { runtimeHours: d.runtimeHours },
        });
        this.logger.debug(`Equipment ${d.equipmentId} runtime updated`);
        break;
      }
      case EQUIPMENT_DOWN_TYPE: {
        const d = envelope.data as EquipmentDownPayload;
        await this.prisma.equipmentProjection.updateMany({
          where: { equipmentId: d.equipmentId },
          data: { status: 'UNDER_MAINTENANCE' },
        });
        this.logger.debug(`Equipment ${d.equipmentId} set UNDER_MAINTENANCE`);
        break;
      }
      case EQUIPMENT_RESTORED_TYPE: {
        const d = envelope.data as EquipmentRestoredPayload;
        await this.prisma.equipmentProjection.updateMany({
          where: { equipmentId: d.equipmentId },
          data: { status: 'AVAILABLE', runtimeHours: 0, lastServiceAt: new Date() },
        });
        this.logger.debug(`Equipment ${d.equipmentId} restored`);
        break;
      }
      case WORK_ORDER_CREATED_TYPE: {
        const d = envelope.data as WorkOrderCreatedPayload;
        await this.prisma.workOrderProjection.upsert({
          where: { workOrderId: d.workOrderId },
          update: {},
          create: {
            workOrderId: d.workOrderId,
            equipmentId: d.equipmentId,
            workOrderNo: d.workOrderNo,
            type: d.type,
            status: 'DRAFT',
            description: d.description,
            createdAt: new Date(envelope.time),
          },
        });
        this.logger.debug(`Work order ${d.workOrderId} created projection`);
        break;
      }
      case WORK_ORDER_STARTED_TYPE: {
        const d = envelope.data as WorkOrderStartedPayload;
        await this.prisma.workOrderProjection.updateMany({
          where: { workOrderId: d.workOrderId },
          data: { status: 'IN_PROGRESS', actualStart: new Date(d.actualStart) },
        });
        this.logger.debug(`Work order ${d.workOrderId} started`);
        break;
      }
      case WORK_ORDER_COMPLETED_TYPE: {
        const d = envelope.data as WorkOrderCompletedPayload;
        await this.prisma.workOrderProjection.updateMany({
          where: { workOrderId: d.workOrderId },
          data: { status: 'COMPLETED', actualEnd: new Date(d.actualEnd) },
        });
        this.logger.debug(`Work order ${d.workOrderId} completed`);
        break;
      }
      case WORK_ORDER_CANCELLED_TYPE: {
        const d = envelope.data as WorkOrderCancelledPayload;
        await this.prisma.workOrderProjection.updateMany({
          where: { workOrderId: d.workOrderId },
          data: { status: 'CANCELLED' },
        });
        this.logger.debug(`Work order ${d.workOrderId} cancelled`);
        break;
      }
      default:
        this.logger.warn(`Unhandled event type: ${envelope.type}`);
    }
  }
}

// Keep backward-compat export alias
export { MaintenanceProjectionHandler as EquipmentRuntimeUpdatedHandler };
