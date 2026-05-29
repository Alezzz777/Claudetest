import { Module } from '@nestjs/common';
import { OpcUaAdapterService } from './opcua-adapter.service';
import { MessagingModule } from '../../infrastructure/messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  providers: [OpcUaAdapterService],
  exports: [OpcUaAdapterService],
})
export class OpcUaAdapterModule {}
