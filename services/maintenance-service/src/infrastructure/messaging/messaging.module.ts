import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { OutboxRelayService } from './outbox-relay.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { MaintenanceProjectionHandler } from '../../application/events/equipment-runtime-updated.handler';

@Module({
  imports: [PersistenceModule],
  providers: [KafkaProducerService, KafkaConsumerService, OutboxRelayService, MaintenanceProjectionHandler],
  exports: [KafkaProducerService, MaintenanceProjectionHandler],
})
export class MessagingModule {}
