import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { MaterialLotAggregate } from '../../domain/material-lot.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class CreateLotCommand {
  constructor(
    public readonly lotNo: string,
    public readonly materialCode: string,
    public readonly quantity: number,
    public readonly locationId: string,
    public readonly tenantId: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(CreateLotCommand)
export class CreateLotHandler implements ICommandHandler<CreateLotCommand, string> {
  private readonly logger = new Logger(CreateLotHandler.name);

  constructor(
    private readonly repo: EventStoreRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(cmd: CreateLotCommand): Promise<string> {
    // Idempotency: check if lot with this lotNo already exists
    const existing = await this.prisma.lotProjection.findUnique({ where: { lotNo: cmd.lotNo } });
    if (existing) {
      this.logger.log(`Lot ${cmd.lotNo} already exists, returning existing id`);
      return existing.lotId;
    }

    const agg = MaterialLotAggregate.create({
      lotNo: cmd.lotNo,
      materialCode: cmd.materialCode,
      quantity: cmd.quantity,
      locationId: cmd.locationId,
      tenantId: cmd.tenantId,
      correlationId: cmd.correlationId,
    });

    const events = agg.popUncommittedEvents();
    await this.repo.save(agg.id, events, agg.sequence);
    this.logger.log(`Lot ${cmd.lotNo} created with id ${agg.id}`);
    return agg.id;
  }
}
