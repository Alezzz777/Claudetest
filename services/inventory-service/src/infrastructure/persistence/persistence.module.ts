import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventStoreRepository } from './event-store.repository';

@Module({
  providers: [PrismaService, EventStoreRepository],
  exports: [PrismaService, EventStoreRepository],
})
export class PersistenceModule {}
