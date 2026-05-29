import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { OpcUaAdapterModule } from './adapters/opcua/opcua-adapter.module';
import { MqttSparkplugAdapterModule } from './adapters/mqtt-sparkplug/mqtt-sparkplug-adapter.module';
import { ErpB2mmlAdapterModule } from './adapters/erp-b2mml/erp-b2mml-adapter.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { ProcessTelemetryHandler } from './application/commands/process-telemetry.handler';
import { GetDeviceStatusHandler } from './application/queries/get-device-status.handler';
import { DeviceOnlineHandler } from './application/events/device-online.handler';
import { IntegrationController } from './api/integration.controller';

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    PersistenceModule,
    MessagingModule,
    OpcUaAdapterModule,
    MqttSparkplugAdapterModule,
    ErpB2mmlAdapterModule,
  ],
  controllers: [IntegrationController],
  providers: [ProcessTelemetryHandler, GetDeviceStatusHandler, DeviceOnlineHandler],
})
export class AppModule {}
