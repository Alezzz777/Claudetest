import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { ProductionOrderStartedHandler } from '../../application/events/production-order-started.handler';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  providers: [KafkaProducerService, KafkaConsumerService, ProductionOrderStartedHandler],
  exports: [KafkaProducerService],
})
export class MessagingModule {}
