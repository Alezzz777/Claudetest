import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, ConflictException } from '@nestjs/common';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { UserAggregate } from '../../domain/user.aggregate';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  private readonly logger = new Logger(CreateUserHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: CreateUserCommand): Promise<string> {
    // Idempotency: check if a user with this keycloakId already exists
    const existing = await this.prisma.eventStore.findFirst({
      where: { aggregateType: 'User', eventType: 'admin.user.created' },
    });
    // More precise check via projection
    const existingProjection = await this.prisma.userProjection.findUnique({
      where: { keycloakId: cmd.keycloakId },
    });
    if (existingProjection) {
      this.logger.warn(`User with keycloakId ${cmd.keycloakId} already exists`);
      return existingProjection.userId;
    }

    const user = UserAggregate.create({
      email: cmd.email,
      displayName: cmd.displayName,
      keycloakId: cmd.keycloakId,
      tenantId: cmd.tenantId,
      correlationId: cmd.correlationId,
    });

    const events = user.popUncommittedEvents();

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
      // Eagerly update projection (also updated by event handler via Kafka)
      const payload = events[0]!.data as any;
      await tx.userProjection.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          email: payload.email,
          displayName: payload.displayName,
          keycloakId: payload.keycloakId,
          tenantId: payload.tenantId,
          roles: [],
          isActive: true,
        },
        update: {},
      });
    });

    this.logger.log(`User created: ${user.id} (${cmd.email})`);
    return user.id;
  }
}
