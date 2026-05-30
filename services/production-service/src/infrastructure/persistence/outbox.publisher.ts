import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { KafkaProducerService } from '../messaging/kafka-producer.service';
import {
  OutboxStatus,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_BATCH_SIZE,
} from '@mes/shared';

/**
 * Outbox relay — polls the outbox table and publishes pending events to Kafka.
 * Runs on a scheduler (every 500ms) to ensure low-latency delivery.
 * On failure, retries up to OUTBOX_MAX_ATTEMPTS before marking DEAD_LETTER.
 */
@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);
  private isRunning = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KafkaProducerService) private readonly kafka: KafkaProducerService,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async relay(): Promise<void> {
    if (this.isRunning) return; // prevent overlapping runs
    this.isRunning = true;
    try {
      await this.processBatch();
    } finally {
      this.isRunning = false;
    }
  }

  private async processBatch(): Promise<void> {
    const rows = await this.prisma.outbox.findMany({
      where: {
        status: OutboxStatus.PENDING,
        attempts: { lt: OUTBOX_MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: OUTBOX_BATCH_SIZE,
    });

    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        await this.kafka.publish({
          topic: row.topic,
          key: row.partitionKey,
          value: JSON.stringify(row.payload),
          headers: {
            eventType: row.eventType,
            aggregateType: row.aggregateType,
            aggregateId: row.aggregateId,
          },
        });

        await this.prisma.outbox.update({
          where: { id: row.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            processedAt: new Date(),
          },
        });
      } catch (err) {
        const newAttempts = row.attempts + 1;
        const isDead = newAttempts >= OUTBOX_MAX_ATTEMPTS;
        this.logger.error(
          `Failed to publish outbox entry ${row.id} (attempt ${newAttempts}): ${err}`,
        );
        await this.prisma.outbox.update({
          where: { id: row.id },
          data: {
            attempts: newAttempts,
            lastError: String(err),
            status: isDead ? OutboxStatus.DEAD_LETTER : OutboxStatus.PENDING,
          },
        });
      }
    }

    this.logger.debug(`Outbox relay processed ${rows.length} row(s)`);
  }
}
