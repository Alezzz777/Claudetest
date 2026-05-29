import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { AssignRoleHandler } from './application/commands/assign-role.handler';
import { GetUserHandler } from './application/queries/get-user.handler';
import { AuditLogWrittenHandler } from './application/events/audit-log-written.handler';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { UserController } from './api/user.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [UserController],
  providers: [AssignRoleHandler, GetUserHandler, AuditLogWrittenHandler],
})
export class AppModule {}
