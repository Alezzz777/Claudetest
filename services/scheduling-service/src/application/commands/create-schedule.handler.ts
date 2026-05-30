import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ProductionScheduleAggregate } from '../../domain/production-schedule.aggregate';

export class CreateScheduleCommand {
  constructor(
    public readonly name: string,
    public readonly shiftDate: Date,
    public readonly createdBy: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CreateScheduleCommand)
export class CreateScheduleHandler
  implements ICommandHandler<CreateScheduleCommand, string>
{
  private readonly logger = new Logger(CreateScheduleHandler.name);

  constructor(
    private readonly eventStore: EventStoreRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(cmd: CreateScheduleCommand): Promise<string> {
    // Idempotency: check if a schedule with same name+shiftDate already exists
    const existing = await this.prisma.scheduleProjection.findFirst({
      where: {
        name: cmd.name,
        shiftDate: cmd.shiftDate,
      },
    });
    if (existing) {
      this.logger.log(`Schedule already exists: ${existing.scheduleId}`);
      return existing.scheduleId;
    }

    const aggregate = ProductionScheduleAggregate.create({
      name: cmd.name,
      shiftDate: cmd.shiftDate,
      createdBy: cmd.createdBy,
      correlationId: cmd.correlationId,
    });

    const uncommitted = aggregate.popUncommittedEvents();
    await this.eventStore.save(aggregate.id, uncommitted, aggregate.sequence);

    this.logger.log(`Schedule created: ${aggregate.id}`);
    return aggregate.id;
  }
}
