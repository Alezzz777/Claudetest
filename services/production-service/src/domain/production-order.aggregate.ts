import { v4 as uuidv4 } from 'uuid';
import {
  EventEnvelope,
  createEventEnvelope,
  MesEventType,
} from '@mes/shared';

// ─── Value objects ────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'DRAFT'
  | 'RELEASED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OperationRecord {
  operationId: string;
  operationNo: number;
  workCenterId: string;
  plannedQty: number;
  completedQty: number;
  scrapQty: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

// ─── Event payloads ───────────────────────────────────────────────────────────

export interface ProductionOrderCreatedPayload {
  orderId: string;
  orderNo: string;
  recipeId: string;
  recipeVersion: string;
  plannedQty: number;
  uom: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  workCenterId: string;
  tenantId: string;
}

export interface ProductionOrderStartedPayload {
  orderId: string;
  startedAt: string;
  operatorId: string;
}

export interface ProductionOperationCompletedPayload {
  orderId: string;
  operationId: string;
  operationNo: number;
  completedQty: number;
  scrapQty: number;
  operatorId: string;
  completedAt: string;
}

export interface OeeMeasuredPayload {
  orderId: string;
  workCenterId: string;
  availability: number;  // 0–1
  performance: number;   // 0–1
  quality: number;       // 0–1
  oee: number;           // availability * performance * quality
  measuredAt: string;
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

/**
 * ProductionOrder aggregate root — implements Event Sourcing.
 *
 * State is rebuilt by replaying the event stream (rehydrate).
 * New state changes produce domain events that are appended to the stream.
 * The aggregate never writes directly to a projection table.
 */
export class ProductionOrderAggregate {
  private _id: string;
  private _orderNo: string = '';
  private _recipeId: string = '';
  private _recipeVersion: string = '';
  private _status: OrderStatus = 'DRAFT';
  private _plannedQty: number = 0;
  private _completedQty: number = 0;
  private _operations: Map<string, OperationRecord> = new Map();
  private _sequence: number = 0;
  private _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) {
    this._id = id;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static create(params: {
    orderNo: string;
    recipeId: string;
    recipeVersion: string;
    plannedQty: number;
    uom: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    workCenterId: string;
    tenantId: string;
    correlationId?: string;
  }): ProductionOrderAggregate {
    const id = uuidv4();
    const aggregate = new ProductionOrderAggregate(id);
    const payload: ProductionOrderCreatedPayload = {
      orderId: id,
      orderNo: params.orderNo,
      recipeId: params.recipeId,
      recipeVersion: params.recipeVersion,
      plannedQty: params.plannedQty,
      uom: params.uom,
      scheduledStartAt: params.scheduledStartAt.toISOString(),
      scheduledEndAt: params.scheduledEndAt.toISOString(),
      workCenterId: params.workCenterId,
      tenantId: params.tenantId,
    };
    aggregate.applyAndRecord(
      createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_CREATED,
        source: 'urn:mes:production-service:ProductionOrder',
        aggregateId: id,
        aggregateType: 'ProductionOrder',
        sequence: 1,
        data: payload,
        correlationId: params.correlationId,
        tenantId: params.tenantId,
      }),
    );
    return aggregate;
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  start(operatorId: string, correlationId?: string): void {
    if (this._status !== 'RELEASED') {
      throw new Error(
        `Cannot start order in status ${this._status}; must be RELEASED`,
      );
    }
    const payload: ProductionOrderStartedPayload = {
      orderId: this._id,
      startedAt: new Date().toISOString(),
      operatorId,
    };
    this.applyAndRecord(
      createEventEnvelope({
        type: MesEventType.PRODUCTION_ORDER_STARTED,
        source: 'urn:mes:production-service:ProductionOrder',
        aggregateId: this._id,
        aggregateType: 'ProductionOrder',
        sequence: this._sequence + 1,
        data: payload,
        correlationId,
      }),
    );
  }

  completeOperation(params: {
    operationId: string;
    operationNo: number;
    completedQty: number;
    scrapQty: number;
    operatorId: string;
    correlationId?: string;
  }): void {
    if (this._status !== 'IN_PROGRESS') {
      throw new Error('Order must be IN_PROGRESS to complete operations');
    }
    const payload: ProductionOperationCompletedPayload = {
      orderId: this._id,
      operationId: params.operationId,
      operationNo: params.operationNo,
      completedQty: params.completedQty,
      scrapQty: params.scrapQty,
      operatorId: params.operatorId,
      completedAt: new Date().toISOString(),
    };
    this.applyAndRecord(
      createEventEnvelope({
        type: MesEventType.PRODUCTION_OPERATION_COMPLETED,
        source: 'urn:mes:production-service:ProductionOrder',
        aggregateId: this._id,
        aggregateType: 'ProductionOrder',
        sequence: this._sequence + 1,
        data: payload,
        correlationId: params.correlationId,
      }),
    );
  }

  // ── Event application (state transitions) ─────────────────────────────────

  private applyAndRecord(envelope: EventEnvelope): void {
    this.apply(envelope);
    this._uncommittedEvents.push(envelope);
  }

  apply(envelope: EventEnvelope): void {
    this._sequence = envelope.sequence;
    switch (envelope.type) {
      case MesEventType.PRODUCTION_ORDER_CREATED: {
        const d = envelope.data as ProductionOrderCreatedPayload;
        this._orderNo = d.orderNo;
        this._recipeId = d.recipeId;
        this._recipeVersion = d.recipeVersion;
        this._plannedQty = d.plannedQty;
        this._status = 'DRAFT';
        break;
      }
      case MesEventType.PRODUCTION_ORDER_RELEASED:
        this._status = 'RELEASED';
        break;
      case MesEventType.PRODUCTION_ORDER_STARTED:
        this._status = 'IN_PROGRESS';
        break;
      case MesEventType.PRODUCTION_ORDER_PAUSED:
        this._status = 'PAUSED';
        break;
      case MesEventType.PRODUCTION_ORDER_COMPLETED:
        this._status = 'COMPLETED';
        break;
      case MesEventType.PRODUCTION_ORDER_CANCELLED:
        this._status = 'CANCELLED';
        break;
      case MesEventType.PRODUCTION_OPERATION_COMPLETED: {
        const d = envelope.data as ProductionOperationCompletedPayload;
        this._completedQty += d.completedQty;
        break;
      }
    }
  }

  /** Rebuild aggregate state from stored event stream */
  static rehydrate(events: EventEnvelope[]): ProductionOrderAggregate {
    if (events.length === 0 || !events[0]) {
      throw new Error('Cannot rehydrate: event stream is empty');
    }
    const first = events[0].data as ProductionOrderCreatedPayload;
    const aggregate = new ProductionOrderAggregate(first.orderId);
    for (const event of events) {
      aggregate.apply(event);
    }
    return aggregate;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  get id(): string { return this._id; }
  get orderNo(): string { return this._orderNo; }
  get status(): OrderStatus { return this._status; }
  get plannedQty(): number { return this._plannedQty; }
  get completedQty(): number { return this._completedQty; }
  get sequence(): number { return this._sequence; }

  popUncommittedEvents(): EventEnvelope[] {
    const events = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return events;
  }
}
