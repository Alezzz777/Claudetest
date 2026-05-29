import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../persistence/prisma.service';
import { KafkaProducerService } from './kafka-producer.service';
import { OutboxStatus, OUTBOX_MAX_ATTEMPTS, OUTBOX_BATCH_SIZE } from '@mes/shared';

/**
 * Outbox relay — polls the outbox table every 500ms and publishes pending events to Kafka.
 * Includes an overlap guard to prevent concurrent runs.
 * After OUTBOX_MAX_ATTEMPTS failures, entries are moved to DEAD_LETTER status.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isRunning = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KafkaProducerService) private readonly kafka: KafkaProducerService,
  ) {}

  @Cron('*/1 * * * * *') // every second (CronExpression.EVERY_SECOND)
  async relay(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.processBatch();
    } finally {
      this.isRunning = false;
    }
  }

  private async processBatch(): Promise<void> {
    const rows = await this.prisma.outbox.findMany({
      where: { status: OutboxStatus.PENDING, attempts: { lt: OUTBOX_MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: OUTBOX_BATCH_SIZE,
    });

    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        await this.kafka.publish(row.topic, row.partitionKey, JSON.stringify(row.payload));
        await this.prisma.outbox.update({
          where: { id: row.id },
          data: { status: OutboxStatus.PUBLISHED, processedAt: new Date() },
        });
      } catch (err) {
        const newAttempts = row.attempts + 1;
        const isDead = newAttempts >= OUTBOX_MAX_ATTEMPTS;
        this.logger.error(`Failed to publish outbox entry ${row.id} (attempt ${newAttempts}): ${err}`);
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
