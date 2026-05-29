import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventStoreRepository } from './event-store.repository';
import { OutboxPublisher } from './outbox.publisher';

@Module({
  providers: [PrismaService, EventStoreRepository, OutboxPublisher],
  exports: [PrismaService, EventStoreRepository, OutboxPublisher],
})
export class PersistenceModule {}
