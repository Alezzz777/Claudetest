import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { KafkaProducerService } from './kafka-producer.service';

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 50;

/**
 * Polls the outbox_events table and relays unsent events to Kafka.
 * Implements the transactional outbox pattern for at-least-once delivery.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly kafka: KafkaProducerService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => void this.relay(), POLL_INTERVAL_MS);
    this.logger.log('Outbox relay started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    await this.kafka.disconnect();
    this.logger.log('Outbox relay stopped');
  }

  private async relay(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const rows = await this.prisma.outboxEvent.findMany({
        where: { sent: false },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      if (rows.length === 0) return;

      for (const row of rows) {
        try {
          await this.kafka.publish({
            topic: row.topic,
            key: row.key,
            payload: row.payload as object,
          });
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: { sent: true },
          });
        } catch (err) {
          this.logger.error(`Outbox relay failed for entry ${row.id}: ${String(err)}`);
        }
      }

      this.logger.debug(`Outbox relay processed ${rows.length} entry(ies)`);
    } catch (err) {
      this.logger.error(`Outbox relay poll error: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
