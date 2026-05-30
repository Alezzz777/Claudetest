import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { WorkOrderAggregate } from '../../domain/work-order.aggregate';
import { EquipmentAggregate } from '../../domain/equipment.aggregate';

export class CompleteWorkOrderCommand {
  constructor(
    public readonly workOrderId: string,
    public readonly resolution: string,
    public readonly completedBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CompleteWorkOrderCommand)
export class CompleteWorkOrderHandler implements ICommandHandler<CompleteWorkOrderCommand, void> {
  private readonly logger = new Logger(CompleteWorkOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: CompleteWorkOrderCommand): Promise<void> {
    const woEvents = await this.eventStore.load(cmd.workOrderId);
    if (woEvents.length === 0) throw new NotFoundException(`Work order ${cmd.workOrderId} not found`);

    const workOrder = WorkOrderAggregate.rehydrate(woEvents);
    const expectedWoVersion = woEvents.length;
    workOrder.complete(cmd.resolution, cmd.completedBy, cmd.correlationId);

    const woNewEvents = workOrder.popUncommittedEvents();
    await this.eventStore.save(workOrder.id, woNewEvents, expectedWoVersion);

    // Restore equipment
    const eqEvents = await this.eventStore.load(workOrder.equipmentId);
    if (eqEvents.length > 0) {
      const equipment = EquipmentAggregate.rehydrate(eqEvents);
      const expectedEqVersion = eqEvents.length;
      equipment.restore(cmd.correlationId);
      const eqNewEvents = equipment.popUncommittedEvents();
      await this.eventStore.save(equipment.id, eqNewEvents, expectedEqVersion);
    }

    this.logger.log(`Work order ${cmd.workOrderId} completed`);
  }
}
