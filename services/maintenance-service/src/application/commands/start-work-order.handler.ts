import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { WorkOrderAggregate } from '../../domain/work-order.aggregate';
import { EquipmentAggregate } from '../../domain/equipment.aggregate';

export class StartWorkOrderCommand {
  constructor(
    public readonly workOrderId: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(StartWorkOrderCommand)
export class StartWorkOrderHandler implements ICommandHandler<StartWorkOrderCommand, void> {
  private readonly logger = new Logger(StartWorkOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: StartWorkOrderCommand): Promise<void> {
    const woEvents = await this.eventStore.load(cmd.workOrderId);
    if (woEvents.length === 0) throw new NotFoundException(`Work order ${cmd.workOrderId} not found`);

    const workOrder = WorkOrderAggregate.rehydrate(woEvents);
    const expectedWoVersion = woEvents.length;
    workOrder.start(cmd.correlationId);

    const woNewEvents = workOrder.popUncommittedEvents();
    await this.eventStore.save(workOrder.id, woNewEvents, expectedWoVersion);

    // Set equipment under maintenance
    const eqEvents = await this.eventStore.load(workOrder.equipmentId);
    if (eqEvents.length > 0) {
      const equipment = EquipmentAggregate.rehydrate(eqEvents);
      const expectedEqVersion = eqEvents.length;
      equipment.setUnderMaintenance(cmd.workOrderId, cmd.correlationId);
      const eqNewEvents = equipment.popUncommittedEvents();
      await this.eventStore.save(equipment.id, eqNewEvents, expectedEqVersion);
    }

    this.logger.log(`Work order ${cmd.workOrderId} started`);
  }
}
