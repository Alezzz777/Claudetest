import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { EquipmentAggregate } from '../../domain/equipment.aggregate';

export class CreateEquipmentCommand {
  constructor(
    public readonly name: string,
    public readonly workCenterId: string,
    public readonly maintenanceThresholdHours: number,
    public readonly tenantId: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CreateEquipmentCommand)
export class CreateEquipmentHandler implements ICommandHandler<CreateEquipmentCommand, string> {
  private readonly logger = new Logger(CreateEquipmentHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: CreateEquipmentCommand): Promise<string> {
    // Idempotency: check by name + workCenterId + tenantId
    const existing = await this.prisma.equipmentProjection.findFirst({
      where: { name: cmd.name, workCenterId: cmd.workCenterId, tenantId: cmd.tenantId },
    });
    if (existing) {
      this.logger.log(`Equipment ${cmd.name} already exists, returning ${existing.equipmentId}`);
      return existing.equipmentId;
    }

    const equipment = EquipmentAggregate.create({
      name: cmd.name,
      workCenterId: cmd.workCenterId,
      maintenanceThresholdHours: cmd.maintenanceThresholdHours,
      tenantId: cmd.tenantId,
      correlationId: cmd.correlationId,
    });

    const events = equipment.popUncommittedEvents();
    await this.eventStore.save(equipment.id, events, 0);

    this.logger.log(`Equipment ${equipment.id} created`);
    return equipment.id;
  }
}
