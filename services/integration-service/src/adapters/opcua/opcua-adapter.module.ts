import { Module } from '@nestjs/common';
import { OpcuaAdapterService } from './opcua-adapter.service';
import { MessagingModule } from '../../infrastructure/messaging/messaging.module';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { UnsMapper } from './uns-mapper';

@Module({
  imports: [MessagingModule, PersistenceModule],
  providers: [
    {
      provide: UnsMapper,
      useFactory: () => new UnsMapper({}),
    },
    OpcuaAdapterService,
  ],
  exports: [OpcuaAdapterService, UnsMapper],
})
export class OpcUaAdapterModule {}
