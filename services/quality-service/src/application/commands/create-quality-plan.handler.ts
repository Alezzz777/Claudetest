import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { QualityPlanAggregate, MeasurementSpec } from '../../domain/quality-plan.aggregate';

export class CreateQualityPlanCommand {
  constructor(
    public readonly productCode: string,
    public readonly specs: MeasurementSpec[],
    public readonly createdBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CreateQualityPlanCommand)
export class CreateQualityPlanHandler implements ICommandHandler<CreateQualityPlanCommand, string> {
  private readonly logger = new Logger(CreateQualityPlanHandler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventStoreRepository) private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: CreateQualityPlanCommand): Promise<string> {
    // Idempotency: check if plan for this productCode already exists as ACTIVE
    const existing = await this.prisma.qualityPlanProjection.findFirst({
      where: { productCode: cmd.productCode, status: 'ACTIVE' },
    });
    if (existing) {
      throw new ConflictException(`An active quality plan already exists for product ${cmd.productCode}`);
    }

    const plan = QualityPlanAggregate.create({
      productCode: cmd.productCode,
      specs: cmd.specs,
      createdBy: cmd.createdBy,
      correlationId: cmd.correlationId,
    });

    const events = plan.popUncommittedEvents();
    await this.eventStore.save(plan.id, events, 0);

    this.logger.log(`Quality plan ${plan.id} created for product ${cmd.productCode}`);
    return plan.id;
  }
}
