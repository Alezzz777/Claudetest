import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';

// Command handlers
import { AssignRoleHandler } from './application/commands/assign-role.handler';
import { CreateUserHandler } from './application/commands/create-user.handler';
import { DeactivateUserHandler } from './application/commands/deactivate-user.handler';

// Query handlers
import { GetUserHandler } from './application/queries/get-user.handler';
import { ListUsersHandler } from './application/queries/list-users.handler';
import { GetAuditLogHandler } from './application/queries/get-audit-log.handler';

// Event handlers
import { AuditLogWrittenHandler } from './application/events/audit-log-written.handler';
import { UserProjectionHandler } from './application/events/user-projection.handler';

// Infrastructure modules
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { KeycloakModule } from './infrastructure/keycloak/keycloak.module';
import { SchemaRegistryModule } from './infrastructure/schema-registry/schema-registry.module';

// Controllers
import { UserController } from './api/user.controller';
import { SchemaController } from './api/schema.controller';
import { AuditController } from './api/audit.controller';

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
  providers: [
    // Commands
    CreateUserHandler,
    AssignRoleHandler,
    DeactivateUserHandler,
    // Queries
    GetUserHandler,
    ListUsersHandler,
    GetAuditLogHandler,
    // Events (also provided in MessagingModule, listed here for CQRS registration)
    AuditLogWrittenHandler,
    UserProjectionHandler,
  ],
})
export class AppModule {}
