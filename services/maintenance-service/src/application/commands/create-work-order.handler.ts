import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { WorkOrderAggregate, WorkOrderType } from '../../domain/work-order.aggregate';

export class CreateWorkOrderCommand {
  constructor(
    public readonly equipmentId: string,
    public readonly workOrderNo: string,
    public readonly type: WorkOrderType,
    public readonly description: string,
    public readonly createdBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CreateWorkOrderCommand)
export class CreateWorkOrderHandler implements ICommandHandler<CreateWorkOrderCommand, string> {
  private readonly logger = new Logger(CreateWorkOrderHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: CreateWorkOrderCommand): Promise<string> {
    // Idempotency check
    const existing = await this.prisma.workOrderProjection.findUnique({
      where: { workOrderNo: cmd.workOrderNo },
    });
    if (existing) {
      this.logger.log(`Work order ${cmd.workOrderNo} already exists, returning ${existing.workOrderId}`);
      return existing.workOrderId;
    }

    const workOrder = WorkOrderAggregate.create({
      equipmentId: cmd.equipmentId,
      workOrderNo: cmd.workOrderNo,
      type: cmd.type,
      description: cmd.description,
      createdBy: cmd.createdBy,
      correlationId: cmd.correlationId,
    });

    const events = workOrder.popUncommittedEvents();
    await this.eventStore.save(workOrder.id, events, 0);

    this.logger.log(`Work order ${workOrder.id} created for equipment ${cmd.equipmentId}`);
    return workOrder.id;
  }
}
