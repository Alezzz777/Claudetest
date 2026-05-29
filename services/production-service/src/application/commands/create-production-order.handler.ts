import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { OutboxPublisher } from '../../infrastructure/persistence/outbox.publisher';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ProductionOrderAggregate } from '../../domain/production-order.aggregate';

// ─── Command ──────────────────────────────────────────────────────────────────

export class CreateProductionOrderCommand {
  constructor(
    public readonly orderNo: string,
    public readonly recipeId: string,
    public readonly recipeVersion: string,
    public readonly plannedQty: number,
    public readonly uom: string,
    public readonly scheduledStartAt: Date,
    public readonly scheduledEndAt: Date,
    public readonly workCenterId: string,
    public readonly tenantId: string,
    public readonly correlationId: string,
  ) {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@CommandHandler(CreateProductionOrderCommand)
export class CreateProductionOrderHandler
  implements ICommandHandler<CreateProductionOrderCommand, string>
{
  private readonly logger = new Logger(CreateProductionOrderHandler.name);

  constructor(
    @Inject(EventStoreRepository)
    private readonly eventStore: EventStoreRepository,
    @Inject(OutboxPublisher)
    private readonly outbox: OutboxPublisher,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: CreateProductionOrderCommand): Promise<string> {
    const {
      orderNo,
      recipeId,
      recipeVersion,
      plannedQty,
      uom,
      scheduledStartAt,
      scheduledEndAt,
      workCenterId,
      tenantId,
      correlationId,
    } = command;

    this.logger.log(`Creating production order ${orderNo}`);

    // Idempotency: check if order with this orderNo already exists
    const existing = await this.prisma.productionOrderProjection.findUnique({
      where: { orderNo },
    });
    if (existing) {
      this.logger.log(`Order ${orderNo} already exists with id ${existing.orderId}; returning existing`);
      return existing.orderId;
    }

    // Create aggregate — raises PRODUCTION_ORDER_CREATED
    const order = ProductionOrderAggregate.create({
      orderNo,
      recipeId,
      recipeVersion,
      plannedQty,
      uom,
      scheduledStartAt,
      scheduledEndAt,
      workCenterId,
      tenantId,
      correlationId,
    });

    const newEvents = order.popUncommittedEvents();

    // Persist events + outbox rows
    await this.eventStore.saveWithOutbox(order.id, order.sequence, newEvents, this.outbox);

    this.logger.log(`Production order ${orderNo} created with id ${order.id}`);
    return order.id;
  }
}
