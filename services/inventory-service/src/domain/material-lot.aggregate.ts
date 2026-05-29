import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type LotStatus = 'AVAILABLE' | 'RESERVED' | 'IN_USE' | 'CONSUMED' | 'SCRAPPED' | 'ON_HOLD';

export interface LotCreatedPayload {
  lotId: string;
  lotNumber: string;
  materialId: string;
  materialCode: string;
  quantity: number;
  uom: string;
  locationId: string;
  orderId: string | null;
  tenantId: string;
  createdAt: string;
}

export interface LotMovedPayload {
  lotId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  movedBy: string;
  movedAt: string;
  reason: string;
}

export interface LotConsumedPayload {
  lotId: string;
  orderId: string;
  operationId: string;
  quantityConsumed: number;
  remainingQuantity: number;
  consumedAt: string;
}

/**
 * MaterialLot aggregate — tracks a discrete lot of WIP material through the plant.
 * Full traceability: every movement, consumption and hold is recorded as an event.
 */
export class MaterialLotAggregate {
  private _id: string;
  private _lotNumber: string = '';
  private _materialId: string = '';
  private _quantity: number = 0;
  private _locationId: string = '';
  private _status: LotStatus = 'AVAILABLE';
  private _sequence: number = 0;
  private _uncommitted: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: { lotNumber: string; materialId: string; materialCode: string; quantity: number; uom: string; locationId: string; orderId: string | null; tenantId: string; correlationId?: string }): MaterialLotAggregate {
    const id = uuidv4();
    const agg = new MaterialLotAggregate(id);
    const payload: LotCreatedPayload = { lotId: id, lotNumber: params.lotNumber, materialId: params.materialId, materialCode: params.materialCode, quantity: params.quantity, uom: params.uom, locationId: params.locationId, orderId: params.orderId, tenantId: params.tenantId, createdAt: new Date().toISOString() };
    agg.applyAndRecord(createEventEnvelope({ type: MesEventType.INVENTORY_LOT_CREATED, source: 'urn:mes:inventory-service:MaterialLot', aggregateId: id, aggregateType: 'MaterialLot', sequence: 1, data: payload, correlationId: params.correlationId }));
    return agg;
  }

  move(toLocationId: string, quantity: number, movedBy: string, reason: string, correlationId?: string): void {
    if (this._status === 'CONSUMED' || this._status === 'SCRAPPED') throw new Error(`Cannot move lot in status ${this._status}`);
    const payload: LotMovedPayload = { lotId: this._id, fromLocationId: this._locationId, toLocationId, quantity, movedBy, movedAt: new Date().toISOString(), reason };
    this.applyAndRecord(createEventEnvelope({ type: MesEventType.INVENTORY_LOT_MOVED, source: 'urn:mes:inventory-service:MaterialLot', aggregateId: this._id, aggregateType: 'MaterialLot', sequence: this._sequence + 1, data: payload, correlationId }));
  }

  consume(orderId: string, operationId: string, quantity: number, correlationId?: string): void {
    if (quantity > this._quantity) throw new Error(`Cannot consume ${quantity}; only ${this._quantity} available`);
    const remaining = this._quantity - quantity;
    const payload: LotConsumedPayload = { lotId: this._id, orderId, operationId, quantityConsumed: quantity, remainingQuantity: remaining, consumedAt: new Date().toISOString() };
    this.applyAndRecord(createEventEnvelope({ type: MesEventType.INVENTORY_LOT_CONSUMED, source: 'urn:mes:inventory-service:MaterialLot', aggregateId: this._id, aggregateType: 'MaterialLot', sequence: this._sequence + 1, data: payload, correlationId }));
  }

  private applyAndRecord(e: EventEnvelope): void { this.apply(e); this._uncommitted.push(e); }

  apply(e: EventEnvelope): void {
    this._sequence = e.sequence;
    if (e.type === MesEventType.INVENTORY_LOT_CREATED) {
      const d = e.data as LotCreatedPayload;
      this._lotNumber = d.lotNumber; this._materialId = d.materialId; this._quantity = d.quantity; this._locationId = d.locationId;
    }
    if (e.type === MesEventType.INVENTORY_LOT_MOVED) { this._locationId = (e.data as LotMovedPayload).toLocationId; }
    if (e.type === MesEventType.INVENTORY_LOT_CONSUMED) {
      const d = e.data as LotConsumedPayload;
      this._quantity = d.remainingQuantity;
      if (d.remainingQuantity === 0) this._status = 'CONSUMED';
    }
  }

  static rehydrate(events: EventEnvelope[]): MaterialLotAggregate {
    const first = events[0]?.data as { lotId: string };
    const agg = new MaterialLotAggregate(first.lotId);
    for (const e of events) agg.apply(e);
    return agg;
  }

  get id() { return this._id; }
  get quantity() { return this._quantity; }
  get locationId() { return this._locationId; }
  get status() { return this._status; }
  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommitted]; this._uncommitted = []; return e; }
}
