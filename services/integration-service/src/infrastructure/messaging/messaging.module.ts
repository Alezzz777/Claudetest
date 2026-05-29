import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { DeviceOnlineHandler } from '../../application/events/device-online.handler';
@Module({ imports: [PersistenceModule], providers: [KafkaProducerService, KafkaConsumerService, DeviceOnlineHandler], exports: [KafkaProducerService] })
export class MessagingModule {}
