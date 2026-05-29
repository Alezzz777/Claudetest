import { Injectable, Logger } from '@nestjs/common';
import { parseStringPromise, Builder } from 'xml2js';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';

/**
 * ERP B2MML Adapter — receives production orders from ERP systems via B2MML
 * (Business To Manufacturing Markup Language, WBF/ISA-95 standard) over REST
 * or message queue, converts to MES domain events.
 *
 * B2MML uses XML schemas aligned with ISA-95 data models:
 *  - ProductionSchedule — production orders from ERP
 *  - MaterialRequirements — BOM / material allocations
 *  - ProductionPerformance — actuals sent back to ERP
 *  - QualityTestResults — QC data sent back to ERP
 *
 * Flow:
 *   ERP sends B2MML XML → this adapter parses → creates MES domain event
 *   MES events → this adapter converts → B2MML XML → sends to ERP
 */
@Injectable()
export class ErpB2mmlAdapterService {
  private readonly logger = new Logger(ErpB2mmlAdapterService.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  /**
   * Process an incoming B2MML ProductionSchedule XML from ERP.
   * Creates integration.erp.order-received events for each production order.
   */
  async processProductionSchedule(xmlPayload: string): Promise<{ ordersReceived: number }> {
    this.logger.log('Processing B2MML ProductionSchedule from ERP');

    let parsed: Record<string, unknown>;
    try {
      parsed = await parseStringPromise(xmlPayload, {
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
      }) as Record<string, unknown>;
    } catch (err) {
      this.logger.error(`Failed to parse B2MML XML: ${err}`);
      throw new Error(`Invalid B2MML XML: ${err}`);
    }

    // Navigate ISA-95 B2MML structure
    const schedule = (parsed['ProductionSchedule'] as Record<string, unknown>) ?? {};
    const requests = this.asArray((schedule['ProductionRequest'] as unknown[])) ?? [];

    let ordersReceived = 0;

    for (const request of requests) {
      const req = request as Record<string, unknown>;
      const orderId = String((req['ID'] as Record<string, unknown>)?.['_'] ?? '');
      const productCode = String((req['ProductProductionRuleID'] as Record<string, unknown>)?.['_'] ?? '');
      const quantity = parseFloat(String((req['ProductSegmentRequirement'] as Record<string, unknown>)?.['QuantitySpecification']?.['Quantity'] ?? '0'));

      if (!orderId) continue;

      const envelope = createEventEnvelope({
        type: MesEventType.INTEGRATION_ERP_ORDER_RECEIVED,
        source: 'urn:mes:integration-service:ErpB2mmlAdapter',
        aggregateId: orderId,
        aggregateType: 'ErpProductionOrder',
        sequence: 1,
        data: {
          erpOrderId: orderId,
          productCode,
          quantity,
          rawB2mml: req,
          receivedAt: new Date().toISOString(),
        },
      });

      await this.kafkaProducer.publish(
        MesEventType.INTEGRATION_ERP_ORDER_RECEIVED,
        `ErpProductionOrder:${orderId}`,
        JSON.stringify(envelope),
      );
      ordersReceived++;
    }

    this.logger.log(`Processed ${ordersReceived} production orders from ERP B2MML`);
    return { ordersReceived };
  }

  /**
   * Build a B2MML ProductionPerformance XML response to send back to ERP.
   * Called after production orders complete to report actuals.
   */
  buildProductionPerformanceXml(params: {
    orderId: string;
    productCode: string;
    plannedQty: number;
    actualQty: number;
    scrapQty: number;
    startedAt: Date;
    completedAt: Date;
  }): string {
    const builder = new Builder({ rootName: 'ProductionPerformance', xmldec: { version: '1.0', encoding: 'UTF-8' } });
    const obj = {
      $: { xmlns: 'http://www.mesa.org/xml/B2MML-V0600' },
      ID: params.orderId,
      PublishedDate: new Date().toISOString(),
      ProductionResponse: {
        ID: `RESP-${params.orderId}`,
        ProductProductionRuleID: params.productCode,
        StartTime: params.startedAt.toISOString(),
        EndTime: params.completedAt.toISOString(),
        ProductionQuantity: {
          QuantityString: String(params.actualQty),
          UnitOfMeasure: 'EA',
        },
        ScrapQuantity: {
          QuantityString: String(params.scrapQty),
          UnitOfMeasure: 'EA',
        },
      },
    };
    return builder.buildObject(obj);
  }

  private asArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
}
