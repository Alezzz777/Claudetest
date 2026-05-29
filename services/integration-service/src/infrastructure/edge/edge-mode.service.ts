import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { KafkaProducerService } from '../messaging/kafka-producer.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EdgeModeService implements OnModuleInit {
  private readonly logger = new Logger(EdgeModeService.name);
  private readonly isEdgeMode: boolean;
  private replayInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {
    this.isEdgeMode = process.env['EDGE_MODE'] === 'true';
  }

  onModuleInit(): void {
    if (!this.isEdgeMode) {
      // Not in edge mode — start replay loop to flush buffered events periodically
      this.replayInterval = setInterval(() => {
        void this.replayBuffer();
      }, 10_000);
    } else {
      this.logger.log('Running in EDGE_MODE — Kafka publishing disabled, buffering locally');
    }
  }

  isEdge(): boolean {
    return this.isEdgeMode;
  }

  async bufferEvent(topic: string, partitionKey: string, payload: object): Promise<void> {
    await this.prisma.edgeBuffer.create({
      data: {
        id: uuidv4(),
        topic,
        partitionKey,
        payload,
        replayed: false,
      },
    });
  }

  async replayBuffer(): Promise<void> {
    const pending = await this.prisma.edgeBuffer.findMany({
      where: { replayed: false },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (pending.length === 0) return;

    let replayed = 0;
    for (const event of pending) {
      try {
        await this.kafkaProducer.publish(
          event.topic,
          event.partitionKey,
          JSON.stringify(event.payload),
        );
        await this.prisma.edgeBuffer.update({
          where: { id: event.id },
          data: { replayed: true },
        });
        replayed++;
      } catch (err) {
        this.logger.error(`Failed to replay edge buffer event ${event.id}: ${err}`);
      }
    }

    if (replayed > 0) {
      this.logger.log(`Replayed ${replayed} edge buffer events`);
    }
  }

  async getPendingCount(): Promise<number> {
    return this.prisma.edgeBuffer.count({ where: { replayed: false } });
  }
}
