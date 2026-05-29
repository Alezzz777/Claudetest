import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { MoveLotHandler } from './application/commands/move-lot.handler';
import { GetLotStatusHandler } from './application/queries/get-lot-status.handler';
import { LotMovedHandler } from './application/events/lot-moved.handler';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { LotController } from './api/lot.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [LotController],
  providers: [MoveLotHandler, GetLotStatusHandler, LotMovedHandler],
})
export class AppModule {}
