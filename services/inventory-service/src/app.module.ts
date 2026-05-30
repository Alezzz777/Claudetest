import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';

// Commands
import { CreateLotHandler } from './application/commands/create-lot.handler';
import { MoveLotHandler } from './application/commands/move-lot.handler';
import { ReserveLotHandler } from './application/commands/reserve-lot.handler';
import { ReleaseLotHandler } from './application/commands/release-lot.handler';
import { ConsumeLotHandler } from './application/commands/consume-lot.handler';

// Queries
import { GetLotStatusHandler } from './application/queries/get-lot-status.handler';
import { ListLotsHandler } from './application/queries/list-lots.handler';
import { GetWipHandler } from './application/queries/get-wip.handler';

// Event Handlers
import { LotProjectionHandler } from './application/events/lot-moved.handler';

// Infrastructure
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { EventStoreRepository } from './infrastructure/persistence/event-store.repository';
import { OutboxRelayService } from './infrastructure/messaging/outbox-relay.service';

// API
import { LotController } from './api/lot.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [LotController],
  providers: [
    // Commands
    CreateLotHandler,
    MoveLotHandler,
    ReserveLotHandler,
    ReleaseLotHandler,
    ConsumeLotHandler,
    // Queries
    GetLotStatusHandler,
    ListLotsHandler,
    GetWipHandler,
    // Event Handlers
    LotProjectionHandler,
    // Infrastructure
    EventStoreRepository,
    OutboxRelayService,
  ],
})
export class AppModule {}
