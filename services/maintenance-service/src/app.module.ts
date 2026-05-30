import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { CreateWorkOrderHandler } from './application/commands/create-work-order.handler';
import { StartWorkOrderHandler } from './application/commands/start-work-order.handler';
import { CompleteWorkOrderHandler } from './application/commands/complete-work-order.handler';
import { CancelWorkOrderHandler } from './application/commands/cancel-work-order.handler';
import { CreateEquipmentHandler } from './application/commands/create-equipment.handler';
import { GetEquipmentStatusHandler } from './application/queries/get-equipment-status.handler';
import { ListEquipmentHandler } from './application/queries/list-equipment.handler';
import { GetWorkOrderHandler } from './application/queries/get-work-order.handler';
import { ListWorkOrdersHandler } from './application/queries/list-work-orders.handler';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { WorkOrderController } from './api/work-order.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [WorkOrderController],
  providers: [
    // Commands
    CreateEquipmentHandler,
    CreateWorkOrderHandler,
    StartWorkOrderHandler,
    CompleteWorkOrderHandler,
    CancelWorkOrderHandler,
    // Queries
    GetEquipmentStatusHandler,
    ListEquipmentHandler,
    GetWorkOrderHandler,
    ListWorkOrdersHandler,
  ],
})
export class AppModule {}
