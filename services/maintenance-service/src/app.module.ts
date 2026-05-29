import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { CreateWorkOrderHandler } from './application/commands/create-work-order.handler';
import { GetEquipmentStatusHandler } from './application/queries/get-equipment-status.handler';
import { EquipmentRuntimeUpdatedHandler } from './application/events/equipment-runtime-updated.handler';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { WorkOrderController } from './api/work-order.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [WorkOrderController],
  providers: [CreateWorkOrderHandler, GetEquipmentStatusHandler, EquipmentRuntimeUpdatedHandler],
})
export class AppModule {}
