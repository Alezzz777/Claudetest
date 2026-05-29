import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { EquipmentAggregate, WorkOrderType } from '../../domain/equipment.aggregate';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';

export class CreateWorkOrderCommand {
  constructor(
    public readonly equipmentId: string,
    public readonly workOrderType: WorkOrderType,
    public readonly description: string,
    public readonly priority: number,
    public readonly plannedStartAt: Date,
    public readonly createdBy: string,
    public readonly correlationId: string,
  ) {}
}

@CommandHandler(CreateWorkOrderCommand)
export class CreateWorkOrderHandler implements ICommandHandler<CreateWorkOrderCommand, string> {
  private readonly logger = new Logger(CreateWorkOrderHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: CreateWorkOrderCommand): Promise<string> {
    const rows = await this.prisma.eventStore.findMany({
      where: { aggregateId: cmd.equipmentId }, orderBy: { sequence: 'asc' },
    });
    const events = rows.map((r) => r.payload as unknown as EventEnvelope);
    const equipment = events.length > 0
      ? EquipmentAggregate.rehydrate(events)
      : new (EquipmentAggregate as any)(cmd.equipmentId);

    const workOrderId = equipment.createWorkOrder({
      workOrderType: cmd.workOrderType,
      description: cmd.description,
      priority: cmd.priority,
      plannedStartAt: cmd.plannedStartAt,
      createdBy: cmd.createdBy,
      correlationId: cmd.correlationId,
    });

    const newEvents = equipment.popUncommittedEvents();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.createMany({ data: newEvents.map((e) => ({ id: e.id, aggregateId: e.aggregateId, aggregateType: e.aggregateType, eventType: e.type, sequence: e.sequence, payload: e as unknown as Record<string, unknown>, correlationId: e.correlationId, causationId: e.causationId ?? null, createdAt: new Date(e.time) })) });
      await tx.outbox.createMany({ data: newEvents.map((e) => ({ id: `${e.id}-outbox`, eventType: e.type, aggregateType: e.aggregateType, aggregateId: e.aggregateId, payload: e as unknown as Record<string, unknown>, topic: e.type, partitionKey: envelopeToKafkaKey(e), status: OutboxStatus.PENDING, attempts: 0, createdAt: new Date(), processedAt: null, lastError: null })) });
    });

    this.logger.log(`Work order ${workOrderId} created for equipment ${cmd.equipmentId}`);
    return workOrderId;
  }
}
