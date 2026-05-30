import { Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { OutboxRelayService } from './outbox-relay.service';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuditLogWrittenHandler } from '../../application/events/audit-log-written.handler';
import { UserProjectionHandler } from '../../application/events/user-projection.handler';

@Module({
  imports: [PersistenceModule],
  providers: [
    KafkaProducerService,
    KafkaConsumerService,
    OutboxRelayService,
    AuditLogWrittenHandler,
    UserProjectionHandler,
  ],
  exports: [KafkaProducerService, AuditLogWrittenHandler, UserProjectionHandler],
})
export class MessagingModule {}
