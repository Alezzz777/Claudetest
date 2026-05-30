import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { EventStoreRepository } from './infrastructure/persistence/event-store.repository';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { ScheduleController } from './api/schedule.controller';

// Commands
import { CreateScheduleHandler } from './application/commands/create-schedule.handler';
import { InsertScheduleOrderHandler } from './application/commands/insert-schedule-order.handler';
import { PublishScheduleHandler } from './application/commands/publish-schedule.handler';
import { RescheduleEntryHandler } from './application/commands/reschedule-entry.handler';
import { CancelScheduleEntryHandler } from './application/commands/cancel-schedule-entry.handler';

// Queries
import { GetScheduleHandler } from './application/queries/get-schedule.handler';
import { ListSchedulesHandler } from './application/queries/list-schedules.handler';

// Services
import { ReschedulerService } from './application/services/rescheduler.service';

// Event handlers
import { ScheduleProjectionHandler } from './application/events/schedule-projection.handler';

@Module({
  imports: [CqrsModule, PersistenceModule, MessagingModule],
  controllers: [ScheduleController],
  providers: [
    // Infrastructure
    EventStoreRepository,
    ReschedulerService,
    ScheduleProjectionHandler,
    // Commands
    CreateScheduleHandler,
    InsertScheduleOrderHandler,
    PublishScheduleHandler,
    RescheduleEntryHandler,
    CancelScheduleEntryHandler,
    // Queries
    GetScheduleHandler,
    ListSchedulesHandler,
  ],
})
export class AppModule {}
