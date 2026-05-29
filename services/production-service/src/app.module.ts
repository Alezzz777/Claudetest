import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductionOrderCommandHandlers } from './application/commands';
import { ProductionOrderQueryHandlers } from './application/queries';
import { ProductionEventHandlers } from './application/events';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { ProductionOrderController } from './api/production-order.controller';

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    PersistenceModule,
    MessagingModule,
  ],
  controllers: [ProductionOrderController],
  providers: [
    ...ProductionOrderCommandHandlers,
    ...ProductionOrderQueryHandlers,
    ...ProductionEventHandlers,
  ],
})
export class AppModule {}
