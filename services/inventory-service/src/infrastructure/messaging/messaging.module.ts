import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { LotMovedHandler } from '../../application/events/lot-moved.handler';
@Module({ imports: [PersistenceModule], providers: [KafkaProducerService, KafkaConsumerService, LotMovedHandler], exports: [KafkaProducerService] })
export class MessagingModule {}
