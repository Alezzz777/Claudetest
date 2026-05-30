import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type QualityPlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface MeasurementSpec {
  parameterId: string;
  name: string;
  lsl: number;
  usl: number;
  uom: string;
}

export interface QualityPlanCreatedPayload {
  planId: string;
  productCode: string;
  specs: MeasurementSpec[];
  createdBy: string;
  createdAt: string;
}

export interface QualityPlanActivatedPayload {
  planId: string;
  activatedAt: string;
}

export class QualityPlanAggregate {
  private _id: string;
  _productCode: string = '';
  _status: QualityPlanStatus = 'DRAFT';
  _specs: MeasurementSpec[] = [];
  private _sequence: number = 0;
  _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) {
    this._id = id;
  }

  static create(params: {
    productCode: string;
    specs: MeasurementSpec[];
    createdBy: string;
    correlationId?: string;
  }): QualityPlanAggregate {
    const id = uuidv4();
    const agg = new QualityPlanAggregate(id);
    const payload: QualityPlanCreatedPayload = {
      planId: id,
      productCode: params.productCode,
      specs: params.specs,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.QUALITY_PLAN_CREATED,
      source: 'urn:mes:quality-service:QualityPlan',
      aggregateId: id,
      aggregateType: 'QualityPlan',
      sequence: 1,
      data: payload,
      correlationId: params.correlationId,
    });
    agg.apply(event);
    agg._uncommittedEvents.push(event);
    return agg;
  }

  activate(correlationId?: string): void {
    if (this._status !== 'DRAFT') {
      throw new Error(`Cannot activate plan in status ${this._status}`);
    }
    const payload: QualityPlanActivatedPayload = {
      planId: this._id,
      activatedAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.QUALITY_PLAN_ACTIVATED,
      source: 'urn:mes:quality-service:QualityPlan',
      aggregateId: this._id,
      aggregateType: 'QualityPlan',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  validate(value: number, parameterId: string): { inSpec: boolean; lsl: number; usl: number } {
    const spec = this._specs.find((s) => s.parameterId === parameterId);
    if (!spec) {
      throw new Error(`Parameter ${parameterId} not found in quality plan ${this._id}`);
    }
    return {
      inSpec: value >= spec.lsl && value <= spec.usl,
      lsl: spec.lsl,
      usl: spec.usl,
    };
  }

  apply(event: EventEnvelope): void {
    this._sequence = event.sequence;
    switch (event.type) {
      case MesEventType.QUALITY_PLAN_CREATED: {
        const d = event.data as QualityPlanCreatedPayload;
        this._productCode = d.productCode;
        this._specs = d.specs;
        this._status = 'DRAFT';
        break;
      }
      case MesEventType.QUALITY_PLAN_ACTIVATED: {
        this._status = 'ACTIVE';
        break;
      }
    }
  }

  static rehydrate(events: EventEnvelope[]): QualityPlanAggregate {
    const first = events[0]?.data as { planId: string };
    const agg = new QualityPlanAggregate(first.planId);
    for (const e of events) agg.apply(e);
    return agg;
  }

  popUncommittedEvents(): EventEnvelope[] {
    const e = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return e;
  }

  get id(): string { return this._id; }
  get status(): QualityPlanStatus { return this._status; }
  get productCode(): string { return this._productCode; }
  get specs(): MeasurementSpec[] { return this._specs; }
  get sequence(): number { return this._sequence; }
}
