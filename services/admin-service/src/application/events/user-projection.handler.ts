import { Injectable, Inject, Logger } from '@nestjs/common';
import { EventEnvelope, IdempotentEventHandler, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import {
  UserCreatedPayload,
  UserRoleAssignedPayload,
  UserDeactivatedPayload,
} from '../../domain/user.aggregate';

@Injectable()
export class UserProjectionHandler extends IdempotentEventHandler<unknown> {
  protected readonly logger = new Logger(UserProjectionHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  protected async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    return row !== null;
  }

  protected async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.processedEvent.upsert({
      where: { eventId },
      create: { eventId, processedAt: new Date() },
      update: {},
    });
  }

  protected async handle(event: EventEnvelope<unknown>): Promise<void> {
    switch (event.type) {
      case MesEventType.ADMIN_USER_CREATED:
        await this.onUserCreated(event);
        break;
      case MesEventType.ADMIN_USER_ROLE_ASSIGNED:
        await this.onRoleAssigned(event);
        break;
      case MesEventType.ADMIN_USER_DEACTIVATED:
        await this.onUserDeactivated(event);
        break;
    }
  }

  private async onUserCreated(event: EventEnvelope<unknown>): Promise<void> {
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
  }

  private async onRoleAssigned(event: EventEnvelope<unknown>): Promise<void> {
    const d = event.data as UserRoleAssignedPayload;
    const user = await this.prisma.userProjection.findUnique({ where: { userId: d.userId } });
    if (!user) return;
    const roles = user.roles as string[];
    if (!roles.includes(d.role)) {
      await this.prisma.userProjection.update({
        where: { userId: d.userId },
        data: { roles: [...roles, d.role] },
      });
    }
  }

  private async onUserDeactivated(event: EventEnvelope<unknown>): Promise<void> {
    const d = event.data as UserDeactivatedPayload;
    await this.prisma.userProjection.update({
      where: { userId: d.userId },
      data: { isActive: false },
    });
  }
}
