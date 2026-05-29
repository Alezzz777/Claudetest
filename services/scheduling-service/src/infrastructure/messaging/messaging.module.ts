import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { ScheduleOrderInsertedHandler } from '../../application/events/schedule-order-inserted.handler';
@Module({ imports: [PersistenceModule], providers: [KafkaProducerService, KafkaConsumerService, ScheduleOrderInsertedHandler], exports: [KafkaProducerService] })
export class MessagingModule {}
