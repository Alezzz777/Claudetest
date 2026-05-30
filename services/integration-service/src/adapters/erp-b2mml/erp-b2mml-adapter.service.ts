import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';
import { B2MMLParser, B2MMLBuilder, B2MMLPerformanceReport } from './b2mml-parser';
import { createEventEnvelope, MesEventType } from '@mes/shared';

@Injectable()
export class ErpB2mmlAdapterService {
  private readonly logger = new Logger(ErpB2mmlAdapterService.name);

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly parser: B2MMLParser,
    private readonly builder: B2MMLBuilder,
  ) {}

  async processIncomingSchedule(xml: string): Promise<string> {
    const orders = await this.parser.parseProductionSchedule(xml);
    this.logger.log(`Processing ${orders.length} production orders from ERP`);

    for (const order of orders) {
      const envelope = createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_CREATED,
        source: 'urn:mes:integration-service:ErpB2mml',
        aggregateId: order.id,
        aggregateType: 'ProductionOrder',
        sequence: 1,
        data: {
          source: 'ERP_B2MML',
          ...order,
        },
      });
      await this.kafkaProducer.publish(
        'mes.production.orders',
        order.id,
        JSON.stringify(envelope),
      );
    }

    return this.builder.buildAck(
      orders.length > 0 ? (orders[0]?.id ?? 'unknown') : 'unknown',
      'ACCEPTED',
    );
  }

  buildPerformanceReport(orders: B2MMLPerformanceReport[]): string {
    return this.builder.buildPerformanceReport(orders);
  }
}
