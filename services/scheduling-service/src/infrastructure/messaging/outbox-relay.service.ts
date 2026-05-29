import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { PrismaService } from '../persistence/prisma.service';
import { EventEnvelope } from '@mes/shared';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  onModuleInit(): void {
    this.intervalId = setInterval(() => void this.relay(), 1000);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async relay(): Promise<void> {
    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { sent: false },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      for (const row of pending) {
        const envelope = row.payload as unknown as EventEnvelope;
        await this.kafkaProducer.publish(row.topic, row.partitionKey, JSON.stringify(envelope));
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: { sent: true },
        });
      }

      if (pending.length > 0) {
        this.logger.debug(`Relayed ${pending.length} outbox event(s) to Kafka`);
      }
    } catch (err) {
      this.logger.error('Outbox relay error', err);
    }
  }
}
