import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { DeviceProjectionHandler } from '../../application/events/device-online.handler';
@Module({
  imports: [PersistenceModule],
  providers: [KafkaProducerService, KafkaConsumerService, DeviceProjectionHandler],
  exports: [KafkaProducerService, KafkaConsumerService, DeviceProjectionHandler],
})
export class MessagingModule {}
