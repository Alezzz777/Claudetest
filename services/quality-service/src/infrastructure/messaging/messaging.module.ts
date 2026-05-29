import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { MeasurementRecordedHandler } from '../../application/events/measurement-recorded.handler';

@Module({
  imports: [PersistenceModule],
  providers: [KafkaProducerService, KafkaConsumerService, MeasurementRecordedHandler],
  exports: [KafkaProducerService],
})
export class MessagingModule {}
