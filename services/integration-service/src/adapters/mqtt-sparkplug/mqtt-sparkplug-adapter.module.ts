import { Module } from '@nestjs/common';
import { MqttSparkplugAdapterService } from './mqtt-sparkplug-adapter.service';
import { MessagingModule } from '../../infrastructure/messaging/messaging.module';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';

@Module({
  imports: [MessagingModule, PersistenceModule],
  providers: [MqttSparkplugAdapterService],
  exports: [MqttSparkplugAdapterService],
})
export class MqttSparkplugAdapterModule {}
