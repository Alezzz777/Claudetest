import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { KafkaProducerService } from './kafka-producer.service';
import { EventEnvelope, envelopeToKafkaKey } from '@mes/shared';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: KafkaProducerService,
  ) {}

  onModuleInit() {
    this.intervalRef = setInterval(() => this.relay().catch((e) => this.logger.error(e)), 1000);
  }

  onModuleDestroy() {
    if (this.intervalRef) clearInterval(this.intervalRef);
  }

  async relay(): Promise<void> {
    const pending = await this.prisma.outbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const row of pending) {
      try {
        const envelope = row.payload as unknown as EventEnvelope;
        await this.producer.publish(
          row.topic,
          row.partitionKey,
          JSON.stringify(envelope),
        );
        await this.prisma.outbox.update({
          where: { id: row.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Failed to relay outbox event ${row.id}: ${err}`);
        await this.prisma.outbox.update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            lastError: String(err),
          },
        });
      }
    }
  }
}
