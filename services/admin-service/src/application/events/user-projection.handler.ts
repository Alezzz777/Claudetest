import { Injectable, Inject, Logger } from '@nestjs/common';
import { IdempotentEventHandler } from '@mes/shared';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type { UserCreatedPayload, UserRoleAssignedPayload } from '../../domain/user.aggregate';

@Injectable()
export class UserProjectionHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(UserProjectionHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async handle(event: EventEnvelope<unknown>): Promise<void> {
    switch (event.type) {
      case MesEventType.ADMIN_USER_CREATED: {
        const d = event.data as UserCreatedPayload;
        await this.prisma.userProjection.upsert({
          where: { userId: d.userId },
          create: {
            userId: d.userId,
            email: d.email,
            displayName: d.displayName,
            keycloakId: d.keycloakId,
            tenantId: d.tenantId,
            roles: [],
            isActive: true,
          },
          update: {},
        });
        this.logger.debug(`Projection: user created ${d.userId}`);
        break;
      }
      case MesEventType.ADMIN_USER_ROLE_ASSIGNED: {
        const d = event.data as UserRoleAssignedPayload;
        const row = await this.prisma.userProjection.findUnique({ where: { userId: d.userId } });
        if (row) {
          const roles = row.roles as string[];
          if (!roles.includes(d.role)) {
            roles.push(d.role);
            await this.prisma.userProjection.update({ where: { userId: d.userId }, data: { roles } });
          }
        }
        this.logger.debug(`Projection: role ${d.role} assigned to ${d.userId}`);
        break;
      }
      case MesEventType.ADMIN_USER_DEACTIVATED: {
        const d = event.data as { userId: string };
        await this.prisma.userProjection.update({ where: { userId: d.userId }, data: { isActive: false } });
        this.logger.debug(`Projection: user deactivated ${d.userId}`);
        break;
      }
      default:
        // Not a user-related event; ignore
        break;
    }
  }

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({ where: { eventId: `proj-${eventId}` } });
    return row !== null;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.processedEvent.upsert({
      where: { eventId: `proj-${eventId}` },
      create: { eventId: `proj-${eventId}`, processedAt: new Date() },
      update: {},
    });
  }
}
