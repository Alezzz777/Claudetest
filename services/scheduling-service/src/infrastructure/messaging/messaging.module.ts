import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { OutboxRelayService } from './outbox-relay.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { ScheduleProjectionHandler } from '../../application/events/schedule-projection.handler';
import { ReschedulerService } from '../../application/services/rescheduler.service';
import { EventStoreRepository } from '../persistence/event-store.repository';

@Module({
  imports: [PersistenceModule],
  providers: [
    KafkaProducerService,
    KafkaConsumerService,
    OutboxRelayService,
    EventStoreRepository,
    ReschedulerService,
    ScheduleProjectionHandler,
  ],
  exports: [KafkaProducerService, EventStoreRepository, ReschedulerService, ScheduleProjectionHandler],
})
export class MessagingModule {}
