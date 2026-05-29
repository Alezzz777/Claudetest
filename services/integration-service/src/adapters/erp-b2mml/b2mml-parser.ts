import { Logger } from '@nestjs/common';
import { parseStringPromise, Builder } from 'xml2js';

export interface B2MMLProductionOrder {
  id: string;
  productCode: string;
  quantity: number;
  uom: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  workCenterId: string;
}

export interface B2MMLPerformanceReport {
  orderId: string;
  productCode: string;
  plannedQty: number;
  actualQty: number;
  scrapQty: number;
  startAt: string;
  endAt: string;
  oee: number;
}

export class B2MMLParser {
  private readonly logger = new Logger(B2MMLParser.name);

  async parseProductionSchedule(xml: string): Promise<B2MMLProductionOrder[]> {
    try {
      const root = await parseStringPromise(xml, { explicitArray: false }) as Record<string, unknown>;
      const schedule = root['ProductionSchedule'] as Record<string, unknown> | undefined;
      if (!schedule) return [];

      const raw = schedule['ProductionRequest'];
      const requests: Array<Record<string, unknown>> = raw
        ? Array.isArray(raw)
          ? (raw as Array<Record<string, unknown>>)
          : [raw as Record<string, unknown>]
        : [];

      return requests.map((req) => {
        const quantityNode = req['Quantity'] as Record<string, unknown> | undefined;
        return {
          id: String(req['ID'] ?? ''),
          productCode: String(req['MaterialProducedID'] ?? req['ProducedMaterialLotID'] ?? ''),
          quantity: parseFloat(String(quantityNode?.['QuantityString'] ?? '0')),
          uom: String(quantityNode?.['UnitOfMeasure'] ?? ''),
          scheduledStartAt: String(req['EarliestStartTime'] ?? ''),
          scheduledEndAt: String(req['LatestEndTime'] ?? ''),
          workCenterId: String(req['WorkCenterID'] ?? ''),
        };
      });
    } catch (err) {
      this.logger.error(`Failed to parse B2MML ProductionSchedule: ${err}`);
      return [];
    }
  }
}

export class B2MMLBuilder {
  buildPerformanceReport(reports: B2MMLPerformanceReport[]): string {
    const builder = new Builder({
      rootName: 'ProductionPerformance',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
    });

    const obj = {
      ProductionResponse: reports.map((r) => ({
        ID: r.orderId,
        MaterialProducedID: r.productCode,
        PlannedQuantity: String(r.plannedQty),
        ActualQuantity: String(r.actualQty),
        ScrapQuantity: String(r.scrapQty),
        StartTime: r.startAt,
        EndTime: r.endAt,
        OEE: String(r.oee),
      })),
    };

    return builder.buildObject(obj);
  }

  buildAck(orderId: string, status: 'ACCEPTED' | 'REJECTED', reason?: string): string {
    const builder = new Builder({
      rootName: 'ProductionScheduleAcknowledge',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
    });

    const obj: Record<string, unknown> = {
      OrderID: orderId,
      Status: status,
    };
    if (reason) obj['Reason'] = reason;

    return builder.buildObject(obj);
  }
}
