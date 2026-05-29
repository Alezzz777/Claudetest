import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { UserAggregate } from '../../domain/user.aggregate';
import { DeactivateUserCommand } from './deactivate-user.command';

@CommandHandler(DeactivateUserCommand)
export class DeactivateUserHandler implements ICommandHandler<DeactivateUserCommand> {
  private readonly logger = new Logger(DeactivateUserHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: DeactivateUserCommand): Promise<void> {
    const rows = await this.prisma.eventStore.findMany({
      where: { aggregateId: cmd.userId },
      orderBy: { sequence: 'asc' },
    });
    if (rows.length === 0) throw new NotFoundException(`User ${cmd.userId} not found`);

    const user = UserAggregate.rehydrate(rows.map((r) => r.payload as unknown as EventEnvelope));
    user.deactivate(cmd.correlationId);
    const events = user.popUncommittedEvents();

    if (events.length === 0) {
      this.logger.debug(`User ${cmd.userId} is already inactive, noop`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.createMany({
        data: events.map((e) => ({
          id: e.id,
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          eventType: e.type,
          sequence: e.sequence,
          payload: e as unknown as Record<string, unknown>,
          correlationId: e.correlationId,
          causationId: e.causationId ?? null,
          createdAt: new Date(e.time),
        })),
      });
      await tx.outbox.createMany({
        data: events.map((e) => ({
          id: `${e.id}-outbox`,
          eventType: e.type,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          payload: e as unknown as Record<string, unknown>,
          topic: 'mes.admin.audit',
          partitionKey: envelopeToKafkaKey(e),
          status: OutboxStatus.PENDING,
          attempts: 0,
          createdAt: new Date(),
          processedAt: null,
          lastError: null,
        })),
      });
      await tx.userProjection.update({
        where: { userId: cmd.userId },
        data: { isActive: false },
      });
    });

    this.logger.log(`User ${cmd.userId} deactivated`);
  }
}
