import { Module } from '@nestjs/common';
import { MqttSparkplugAdapterService } from './mqtt-sparkplug-adapter.service';
import { MessagingModule } from '../../infrastructure/messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  providers: [MqttSparkplugAdapterService],
  exports: [MqttSparkplugAdapterService],
})
export class MqttSparkplugAdapterModule {}
