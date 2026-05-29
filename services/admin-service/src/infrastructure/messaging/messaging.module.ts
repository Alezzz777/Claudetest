import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuditLogWrittenHandler } from '../../application/events/audit-log-written.handler';
@Module({ imports: [PersistenceModule], providers: [KafkaProducerService, KafkaConsumerService, AuditLogWrittenHandler], exports: [KafkaProducerService] })
export class MessagingModule {}
