import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { OutboxRelayService } from './outbox-relay.service';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  providers: [KafkaProducerService, OutboxRelayService],
  exports: [KafkaProducerService, OutboxRelayService],
})
export class MessagingModule {}
