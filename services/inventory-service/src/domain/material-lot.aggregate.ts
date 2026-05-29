import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type LotStatus = 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'MOVED';

export interface LotCreatedPayload {
  lotId: string;
  lotNo: string;
  materialCode: string;
  quantity: number;
  locationId: string;
  tenantId: string;
  createdAt: string;
}

export interface LotReservedPayload {
  lotId: string;
  orderId: string;
  qty: number;
}

export interface LotReleasedPayload {
  lotId: string;
  orderId: string;
}

export interface LotMovedPayload {
  lotId: string;
  fromLocationId: string;
  toLocationId: string;
  movedBy: string;
  movedAt: string;
}

export interface LotConsumedPayload {
  lotId: string;
  orderId: string;
  qty: number;
  consumedBy: string;
  remainingQuantity: number;
  consumedAt: string;
}

export class MaterialLotAggregate {
  private _id: string;
  _lotNo: string = '';
  _materialCode: string = '';
  _quantity: number = 0;
  _reservedQty: number = 0;
  _locationId: string = '';
  _status: LotStatus = 'AVAILABLE';
  _tenantId: string = '';
  private _sequence: number = 0;
  _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: {
    lotNo: string;
    materialCode: string;
    quantity: number;
    locationId: string;
    tenantId: string;
    correlationId?: string;
  }): MaterialLotAggregate {
    const id = uuidv4();
    const agg = new MaterialLotAggregate(id);
    const payload: LotCreatedPayload = {
      lotId: id,
      lotNo: params.lotNo,
      materialCode: params.materialCode,
      quantity: params.quantity,
      locationId: params.locationId,
      tenantId: params.tenantId,
      createdAt: new Date().toISOString(),
    };
    agg._applyAndRecord(createEventEnvelope({
      type: MesEventType.INVENTORY_LOT_CREATED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: id,
      aggregateType: 'MaterialLot',
      sequence: 1,
      data: payload,
      correlationId: params.correlationId,
    }));
    return agg;
  }

  reserve(orderId: string, qty: number, correlationId?: string): void {
    if (this._status !== 'AVAILABLE') {
      throw new Error(`Cannot reserve lot in status ${this._status}`);
    }
    if (qty > this._quantity - this._reservedQty) {
      throw new Error(`Cannot reserve ${qty}; only ${this._quantity - this._reservedQty} available`);
    }
    const payload: LotReservedPayload = { lotId: this._id, orderId, qty };
    this._applyAndRecord(createEventEnvelope({
      type: MesEventType.INVENTORY_RESERVATION_CREATED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: this._id,
      aggregateType: 'MaterialLot',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    }));
  }

  release(orderId: string, correlationId?: string): void {
    if (this._status !== 'RESERVED') return;
    const payload: LotReleasedPayload = { lotId: this._id, orderId };
    this._applyAndRecord(createEventEnvelope({
      type: MesEventType.INVENTORY_RESERVATION_FULFILLED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: this._id,
      aggregateType: 'MaterialLot',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    }));
  }

  move(toLocationId: string, movedBy: string, correlationId?: string): void {
    const payload: LotMovedPayload = {
      lotId: this._id,
      fromLocationId: this._locationId,
      toLocationId,
      movedBy,
      movedAt: new Date().toISOString(),
    };
    this._applyAndRecord(createEventEnvelope({
      type: MesEventType.INVENTORY_LOT_MOVED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: this._id,
      aggregateType: 'MaterialLot',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    }));
  }

  consume(orderId: string, qty: number, consumedBy: string, correlationId?: string): void {
    if (qty > this._quantity - this._reservedQty) {
      throw new Error(`Cannot consume ${qty}; only ${this._quantity - this._reservedQty} available`);
    }
    const remaining = this._quantity - qty;
    const payload: LotConsumedPayload = {
      lotId: this._id,
      orderId,
      qty,
      consumedBy,
      remainingQuantity: remaining,
      consumedAt: new Date().toISOString(),
    };
    this._applyAndRecord(createEventEnvelope({
      type: MesEventType.INVENTORY_LOT_CONSUMED,
      source: 'urn:mes:inventory-service:MaterialLot',
      aggregateId: this._id,
      aggregateType: 'MaterialLot',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    }));
  }

  private _applyAndRecord(e: EventEnvelope): void {
    this.apply(e);
    this._uncommittedEvents.push(e);
  }

  apply(event: EventEnvelope): void {
    this._sequence = event.sequence;
    switch (event.type) {
      case MesEventType.INVENTORY_LOT_CREATED: {
        const d = event.data as LotCreatedPayload;
        this._lotNo = d.lotNo;
        this._materialCode = d.materialCode;
        this._quantity = d.quantity;
        this._locationId = d.locationId;
        this._tenantId = d.tenantId;
        this._status = 'AVAILABLE';
        break;
      }
      case MesEventType.INVENTORY_RESERVATION_CREATED: {
        const d = event.data as LotReservedPayload;
        this._reservedQty += d.qty;
        this._status = 'RESERVED';
        break;
      }
      case MesEventType.INVENTORY_RESERVATION_FULFILLED: {
        const d = event.data as LotReleasedPayload;
        void d;
        this._reservedQty = 0;
        this._status = 'AVAILABLE';
        break;
      }
      case MesEventType.INVENTORY_LOT_MOVED: {
        const d = event.data as LotMovedPayload;
        this._locationId = d.toLocationId;
        this._status = 'MOVED';
        break;
      }
      case MesEventType.INVENTORY_LOT_CONSUMED: {
        const d = event.data as LotConsumedPayload;
        this._quantity = d.remainingQuantity;
        this._reservedQty = Math.max(0, this._reservedQty - d.qty);
        if (d.remainingQuantity === 0) this._status = 'CONSUMED';
        break;
      }
    }
  }

  static rehydrate(events: EventEnvelope[]): MaterialLotAggregate {
    const first = events[0]?.data as { lotId: string };
    const agg = new MaterialLotAggregate(first.lotId);
    for (const e of events) agg.apply(e);
    return agg;
  }

  popUncommittedEvents(): EventEnvelope[] {
    const events = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return events;
  }

  get id() { return this._id; }
  get lotNo() { return this._lotNo; }
  get materialCode() { return this._materialCode; }
  get quantity() { return this._quantity; }
  get reservedQty() { return this._reservedQty; }
  get locationId() { return this._locationId; }
  get status() { return this._status; }
  get sequence() { return this._sequence; }
}
