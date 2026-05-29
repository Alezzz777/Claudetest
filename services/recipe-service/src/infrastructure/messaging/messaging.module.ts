import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { RecipePublishedHandler } from '../../application/events/recipe-published.handler';
@Module({ imports: [PersistenceModule], providers: [KafkaProducerService, KafkaConsumerService, RecipePublishedHandler], exports: [KafkaProducerService] })
export class MessagingModule {}
