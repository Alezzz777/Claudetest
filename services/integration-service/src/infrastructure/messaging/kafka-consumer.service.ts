import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { DeviceProjectionHandler } from '../../application/events/device-online.handler';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;

  constructor(private readonly deviceProjectionHandler: DeviceProjectionHandler) {}

  async onModuleInit(): Promise<void> {
    const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
    const ssl = process.env['KAFKA_SSL'] === 'true';
    const sasl = process.env['KAFKA_USERNAME']
      ? {
          mechanism: (process.env['KAFKA_SASL_MECHANISM'] ?? 'scram-sha-256') as 'scram-sha-256' | 'scram-sha-512',
          username: process.env['KAFKA_USERNAME'],
          password: process.env['KAFKA_PASSWORD'] ?? '',
        }
      : undefined;
    const kafka = new Kafka({ clientId: 'integration-service', brokers, ssl, sasl });
    this.consumer = kafka.consumer({ groupId: 'integration-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [MesEventType.INTEGRATION_DEVICE_ONLINE, MesEventType.INTEGRATION_DEVICE_OFFLINE, 'mes.integration.telemetry'],
      fromBeginning: false,
    });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handle({ topic, message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    const envelope = JSON.parse(message.value.toString()) as EventEnvelope;

    if (
      topic === MesEventType.INTEGRATION_DEVICE_ONLINE ||
      topic === MesEventType.INTEGRATION_DEVICE_OFFLINE ||
      topic === 'mes.integration.telemetry'
    ) {
      await this.deviceProjectionHandler.handle(envelope as EventEnvelope<any>);
    }
  }
}
