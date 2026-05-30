import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { KeycloakModule } from './infrastructure/keycloak/keycloak.module';
import { SchemaRegistryModule } from './infrastructure/schema-registry/schema-registry.module';
import { CreateUserHandler } from './application/commands/create-user.handler';
import { DeactivateUserHandler } from './application/commands/deactivate-user.handler';
import { AssignRoleHandler } from './application/commands/assign-role.handler';
import { GetUserHandler } from './application/queries/get-user.handler';
import { ListUsersHandler } from './application/queries/list-users.handler';
import { GetAuditLogHandler } from './application/queries/get-audit-log.handler';
import { UserController } from './api/user.controller';
import { SchemaController } from './api/schema.controller';
import { AuditController } from './api/audit.controller';

const CommandHandlers = [CreateUserHandler, DeactivateUserHandler, AssignRoleHandler];
const QueryHandlers = [GetUserHandler, ListUsersHandler, GetAuditLogHandler];

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    PersistenceModule,
    MessagingModule,
    KeycloakModule,
    SchemaRegistryModule,
  ],
  controllers: [UserController, SchemaController, AuditController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class AppModule {}
