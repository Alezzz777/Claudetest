import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { KafkaProducerService } from './kafka-producer.service';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.relay().catch((err: unknown) =>
        this.logger.error('Outbox relay error', err instanceof Error ? err.stack : String(err)),
      );
    }, 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async relay(): Promise<void> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { sent: false },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const row of pending) {
      try {
        await this.kafka.publish(row.topic, row.partitionKey, JSON.stringify(row.payload));
        await this.prisma.outboxEvent.update({ where: { id: row.id }, data: { sent: true } });
      } catch (err) {
        this.logger.warn(`Failed to relay outbox event ${row.id}: ${String(err)}`);
      }
    }
  }
}
