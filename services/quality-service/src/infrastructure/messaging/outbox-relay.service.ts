import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { KafkaProducerService } from './kafka-producer.service';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: KafkaProducerService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => this.relay(), 1000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async relay(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const unsent = await this.prisma.outboxEvent.findMany({
        where: { sent: false },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      for (const row of unsent) {
        try {
          await this.producer.publish(
            row.topic,
            row.partitionKey,
            JSON.stringify(row.payload),
          );
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: { sent: true },
          });
        } catch (err) {
          this.logger.error(`Failed to relay outbox event ${row.id}: ${String(err)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
