import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { EquipmentRuntimeUpdatedHandler } from '../../application/events/equipment-runtime-updated.handler';

@Module({
  imports: [PersistenceModule],
  providers: [KafkaProducerService, KafkaConsumerService, EquipmentRuntimeUpdatedHandler],
  exports: [KafkaProducerService],
})
export class MessagingModule {}
