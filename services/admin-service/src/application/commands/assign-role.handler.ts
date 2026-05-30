import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { UserAggregate, MesRole } from '../../domain/user.aggregate';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';

export class AssignRoleCommand {
  constructor(
    public readonly userId: string,
    public readonly role: MesRole,
    public readonly scopeType: 'GLOBAL' | 'SITE' | 'AREA',
    public readonly scopeId: string | null,
    public readonly assignedBy: string,
    public readonly correlationId: string,
  ) {}
}

@CommandHandler(AssignRoleCommand)
export class AssignRoleHandler implements ICommandHandler<AssignRoleCommand> {
  private readonly logger = new Logger(AssignRoleHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: AssignRoleCommand): Promise<void> {
    const rows = await this.prisma.eventStore.findMany({ where: { aggregateId: cmd.userId }, orderBy: { sequence: 'asc' } });
    const user = UserAggregate.rehydrate(rows.map((r) => r.payload as unknown as EventEnvelope));
    user.assignRole(cmd.role, cmd.scopeType, cmd.scopeId, cmd.assignedBy, cmd.correlationId);
    const newEvents = user.popUncommittedEvents();
    if (newEvents.length === 0) { this.logger.debug(`Role ${cmd.role} already assigned to user ${cmd.userId}`); return; }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.createMany({ data: newEvents.map((e) => ({ id: e.id, aggregateId: e.aggregateId, aggregateType: e.aggregateType, eventType: e.type, sequence: e.sequence, payload: e as unknown as Record<string, unknown>, correlationId: e.correlationId, causationId: e.causationId ?? null, createdAt: new Date(e.time) })) });
      await tx.outbox.createMany({ data: newEvents.map((e) => ({ id: `${e.id}-outbox`, eventType: e.type, aggregateType: e.aggregateType, aggregateId: e.aggregateId, payload: e as unknown as Record<string, unknown>, topic: e.type, partitionKey: envelopeToKafkaKey(e), status: OutboxStatus.PENDING, attempts: 0, createdAt: new Date(), processedAt: null, lastError: null })) });
    });
    this.logger.log(`Role ${cmd.role} assigned to user ${cmd.userId}`);
  }
}
