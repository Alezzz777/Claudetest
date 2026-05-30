import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type NcStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED';

export interface NonConformanceOpenedPayload {
  ncId: string;
  orderId: string;
  lotId?: string;
  description: string;
  raisedBy: string;
  raisedAt: string;
}

export interface NonConformanceClosedPayload {
  ncId: string;
  closedBy: string;
  resolution: string;
  closedAt: string;
}

export class NonConformanceAggregate {
  private _id: string;
  private _orderId: string = '';
  private _lotId?: string;
  private _description: string = '';
  private _status: NcStatus = 'OPEN';
  private _raisedBy: string = '';
  private _sequence: number = 0;
  private _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) {
    this._id = id;
  }

  static open(params: {
    orderId: string;
    lotId?: string;
    description: string;
    raisedBy: string;
    correlationId?: string;
  }): NonConformanceAggregate {
    const id = uuidv4();
    const agg = new NonConformanceAggregate(id);
    const payload: NonConformanceOpenedPayload = {
      ncId: id,
      orderId: params.orderId,
      lotId: params.lotId,
      description: params.description,
      raisedBy: params.raisedBy,
      raisedAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.QUALITY_NCR_RAISED,
      source: 'urn:mes:quality-service:NonConformance',
      aggregateId: id,
      aggregateType: 'NonConformance',
      sequence: 1,
      data: payload,
      correlationId: params.correlationId,
    });
    agg.apply(event);
    agg._uncommittedEvents.push(event);
    return agg;
  }

  close(closedBy: string, resolution: string, correlationId?: string): void {
    if (this._status === 'CLOSED') return;
    const payload: NonConformanceClosedPayload = {
      ncId: this._id,
      closedBy,
      resolution,
      closedAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.QUALITY_NCR_DISPOSITIONED,
      source: 'urn:mes:quality-service:NonConformance',
      aggregateId: this._id,
      aggregateType: 'NonConformance',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  apply(event: EventEnvelope): void {
    this._sequence = event.sequence;
    switch (event.type) {
      case MesEventType.QUALITY_NCR_RAISED: {
        const d = event.data as NonConformanceOpenedPayload;
        this._orderId = d.orderId;
        this._lotId = d.lotId;
        this._description = d.description;
        this._raisedBy = d.raisedBy;
        this._status = 'OPEN';
        break;
      }
      case MesEventType.QUALITY_NCR_DISPOSITIONED: {
        this._status = 'CLOSED';
        break;
      }
    }
  }

  static rehydrate(events: EventEnvelope[]): NonConformanceAggregate {
    const first = events[0]?.data as { ncId: string };
    const agg = new NonConformanceAggregate(first.ncId);
    for (const e of events) agg.apply(e);
    return agg;
  }

  popUncommittedEvents(): EventEnvelope[] {
    const e = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return e;
  }

  get id(): string { return this._id; }
  get status(): NcStatus { return this._status; }
  get orderId(): string { return this._orderId; }
  get lotId(): string | undefined { return this._lotId; }
  get description(): string { return this._description; }
  get raisedBy(): string { return this._raisedBy; }
  get sequence(): number { return this._sequence; }
}
