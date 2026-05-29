import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { InsertScheduleOrderHandler } from './application/commands/insert-schedule-order.handler';
import { GetScheduleHandler } from './application/queries/get-schedule.handler';
import { ScheduleOrderInsertedHandler } from './application/events/schedule-order-inserted.handler';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { ScheduleController } from './api/schedule.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [ScheduleController],
  providers: [InsertScheduleOrderHandler, GetScheduleHandler, ScheduleOrderInsertedHandler],
})
export class AppModule {}
