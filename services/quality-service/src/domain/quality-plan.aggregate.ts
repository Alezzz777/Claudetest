import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type MeasurementResult = 'PASS' | 'FAIL' | 'CONDITIONAL';
export type NcrSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';

export interface QualityMeasurement {
  measurementId: string;
  characteristicId: string;
  characteristicName: string;
  nominalValue: number;
  lowerLimit: number;
  upperLimit: number;
  actualValue: number;
  uom: string;
  result: MeasurementResult;
  operatorId: string;
  measuredAt: Date;
}

export interface QualityMeasurementRecordedPayload {
  planId: string;
  orderId: string;
  measurementId: string;
  characteristicId: string;
  actualValue: number;
  lowerLimit: number;
  upperLimit: number;
  uom: string;
  result: MeasurementResult;
  operatorId: string;
  measuredAt: string;
}

export interface QualityNcrRaisedPayload {
  planId: string;
  ncrId: string;
  orderId: string;
  measurementId: string;
  severity: NcrSeverity;
  description: string;
  raisedBy: string;
  raisedAt: string;
}

/**
 * QualityPlan aggregate — tracks inspection plans and measurements per ISA-88.
 * Event sourced: all measurements and NCRs are recorded as events.
 */
export class QualityPlanAggregate {
  private _id: string;
  private _orderId: string = '';
  private _measurements: QualityMeasurement[] = [];
  private _ncrIds: string[] = [];
  private _sequence: number = 0;
  private _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: { orderId: string; recipeId: string; tenantId: string; correlationId?: string }): QualityPlanAggregate {
    const id = uuidv4();
    const agg = new QualityPlanAggregate(id);
    agg.applyAndRecord(createEventEnvelope({
      type: MesEventType.QUALITY_PLAN_CREATED,
      source: 'urn:mes:quality-service:QualityPlan',
      aggregateId: id,
      aggregateType: 'QualityPlan',
      sequence: 1,
      data: { planId: id, orderId: params.orderId, recipeId: params.recipeId, tenantId: params.tenantId },
      correlationId: params.correlationId,
    }));
    return agg;
  }

  recordMeasurement(params: {
    characteristicId: string;
    characteristicName: string;
    nominalValue: number;
    lowerLimit: number;
    upperLimit: number;
    actualValue: number;
    uom: string;
    operatorId: string;
    correlationId?: string;
  }): void {
    const measurementId = uuidv4();
    const result: MeasurementResult =
      params.actualValue >= params.lowerLimit && params.actualValue <= params.upperLimit
        ? 'PASS' : 'FAIL';

    const payload: QualityMeasurementRecordedPayload = {
      planId: this._id,
      orderId: this._orderId,
      measurementId,
      characteristicId: params.characteristicId,
      actualValue: params.actualValue,
      lowerLimit: params.lowerLimit,
      upperLimit: params.upperLimit,
      uom: params.uom,
      result,
      operatorId: params.operatorId,
      measuredAt: new Date().toISOString(),
    };
    this.applyAndRecord(createEventEnvelope({
      type: MesEventType.QUALITY_MEASUREMENT_RECORDED,
      source: 'urn:mes:quality-service:QualityPlan',
      aggregateId: this._id,
      aggregateType: 'QualityPlan',
      sequence: this._sequence + 1,
      data: payload,
      correlationId: params.correlationId,
    }));

    // Auto-raise NCR on critical failure
    if (result === 'FAIL') {
      const deviation = Math.abs(params.actualValue - params.nominalValue);
      const tolerance = params.upperLimit - params.nominalValue;
      const severity: NcrSeverity = deviation > tolerance * 2 ? 'CRITICAL' : 'MAJOR';
      this.raiseNcr({ measurementId, severity, description: `Out-of-spec: ${params.characteristicName}`, raisedBy: params.operatorId, correlationId: params.correlationId });
    }
  }

  private raiseNcr(params: { measurementId: string; severity: NcrSeverity; description: string; raisedBy: string; correlationId?: string }): void {
    const ncrId = uuidv4();
    this.applyAndRecord(createEventEnvelope({
      type: MesEventType.QUALITY_NCR_RAISED,
      source: 'urn:mes:quality-service:QualityPlan',
      aggregateId: this._id,
      aggregateType: 'QualityPlan',
      sequence: this._sequence + 1,
      data: { planId: this._id, ncrId, orderId: this._orderId, ...params, raisedAt: new Date().toISOString() } as QualityNcrRaisedPayload,
      correlationId: params.correlationId,
    }));
  }

  private applyAndRecord(envelope: EventEnvelope): void {
    this.apply(envelope);
    this._uncommittedEvents.push(envelope);
  }

  apply(envelope: EventEnvelope): void {
    this._sequence = envelope.sequence;
    if (envelope.type === MesEventType.QUALITY_PLAN_CREATED) {
      const d = envelope.data as { orderId: string };
      this._orderId = d.orderId;
    }
    if (envelope.type === MesEventType.QUALITY_NCR_RAISED) {
      const d = envelope.data as QualityNcrRaisedPayload;
      this._ncrIds.push(d.ncrId);
    }
  }

  static rehydrate(events: EventEnvelope[]): QualityPlanAggregate {
    const first = events[0]?.data as { planId: string };
    const agg = new QualityPlanAggregate(first.planId);
    for (const e of events) agg.apply(e);
    return agg;
  }

  get id(): string { return this._id; }
  get ncrCount(): number { return this._ncrIds.length; }
  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommittedEvents]; this._uncommittedEvents = []; return e; }
}
