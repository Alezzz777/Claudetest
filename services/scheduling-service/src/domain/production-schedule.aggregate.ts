import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type ScheduleStatus = 'DRAFT' | 'PUBLISHED' | 'LOCKED';
export type EntryStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ScheduleEntry {
  entryId: string;
  orderId: string;
  workCenterId: string;
  priority: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
  status: EntryStatus;
}

export interface ScheduleCreatedPayload {
  scheduleId: string;
  name: string;
  shiftDate: string;
  createdBy: string;
  createdAt: string;
}

export interface ScheduleOrderInsertedPayload {
  scheduleId: string;
  entryId: string;
  orderId: string;
  workCenterId: string;
  priority: number;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface SchedulePublishedPayload {
  scheduleId: string;
  publishedAt: string;
  publishedBy: string;
}

export interface ScheduleEntryRescheduledPayload {
  scheduleId: string;
  entryId: string;
  newStartAt: string;
  newEndAt: string;
  reason: string;
  rescheduledAt: string;
}

export interface ScheduleEntryCancelledPayload {
  scheduleId: string;
  entryId: string;
  reason: string;
  cancelledAt: string;
}

const SOURCE = 'urn:mes:scheduling-service:ProductionSchedule';
const AGGREGATE_TYPE = 'ProductionSchedule';

export class ProductionScheduleAggregate {
  private _id: string;
  private _name: string = '';
  private _shiftDate: Date = new Date();
  private _status: ScheduleStatus = 'DRAFT';
  private _entries: Map<string, ScheduleEntry> = new Map();
  private _sequence: number = 0;
  private _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) {
    this._id = id;
  }

  static create(params: {
    name: string;
    shiftDate: Date;
    createdBy: string;
    correlationId?: string;
  }): ProductionScheduleAggregate {
    const id = uuidv4();
    const agg = new ProductionScheduleAggregate(id);
    const payload: ScheduleCreatedPayload = {
      scheduleId: id,
      name: params.name,
      shiftDate: params.shiftDate.toISOString(),
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.SCHEDULE_CREATED,
      source: SOURCE,
      aggregateId: id,
      aggregateType: AGGREGATE_TYPE,
      sequence: 1,
      data: payload,
      correlationId: params.correlationId,
    });
    agg.apply(event);
    agg._uncommittedEvents.push(event);
    return agg;
  }

  insertOrder(params: {
    orderId: string;
    workCenterId: string;
    priority: number;
    plannedStartAt: Date;
    plannedEndAt: Date;
    correlationId?: string;
  }): void {
    if (this._status === 'LOCKED') {
      throw new Error(`Schedule ${this._id} is LOCKED and cannot be modified`);
    }
    if (this.hasConflict(params.workCenterId, params.plannedStartAt, params.plannedEndAt)) {
      throw new Error(
        `Work center ${params.workCenterId} has a conflicting entry in the requested time window`,
      );
    }
    const entryId = uuidv4();
    const payload: ScheduleOrderInsertedPayload = {
      scheduleId: this._id,
      entryId,
      orderId: params.orderId,
      workCenterId: params.workCenterId,
      priority: params.priority,
      plannedStartAt: params.plannedStartAt.toISOString(),
      plannedEndAt: params.plannedEndAt.toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.SCHEDULE_ORDER_INSERTED,
      source: SOURCE,
      aggregateId: this._id,
      aggregateType: AGGREGATE_TYPE,
      sequence: this._sequence + 1,
      data: payload,
      correlationId: params.correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  rescheduleEntry(params: {
    entryId: string;
    newStartAt: Date;
    newEndAt: Date;
    reason: string;
    correlationId?: string;
  }): void {
    if (this._status === 'LOCKED') {
      throw new Error(`Schedule ${this._id} is LOCKED and cannot be modified`);
    }
    if (!this._entries.has(params.entryId)) {
      throw new Error(`Entry ${params.entryId} not found in schedule ${this._id}`);
    }
    const payload: ScheduleEntryRescheduledPayload = {
      scheduleId: this._id,
      entryId: params.entryId,
      newStartAt: params.newStartAt.toISOString(),
      newEndAt: params.newEndAt.toISOString(),
      reason: params.reason,
      rescheduledAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.SCHEDULE_ORDER_RESCHEDULED,
      source: SOURCE,
      aggregateId: this._id,
      aggregateType: AGGREGATE_TYPE,
      sequence: this._sequence + 1,
      data: payload,
      correlationId: params.correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  cancelEntry(params: {
    entryId: string;
    reason: string;
    correlationId?: string;
  }): void {
    const entry = this._entries.get(params.entryId);
    if (!entry || entry.status === 'CANCELLED') return;
    const payload: ScheduleEntryCancelledPayload = {
      scheduleId: this._id,
      entryId: params.entryId,
      reason: params.reason,
      cancelledAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: 'scheduling.entry.cancelled',
      source: SOURCE,
      aggregateId: this._id,
      aggregateType: AGGREGATE_TYPE,
      sequence: this._sequence + 1,
      data: payload,
      correlationId: params.correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  publish(publishedBy: string, correlationId?: string): void {
    if (this._status === 'PUBLISHED' || this._status === 'LOCKED') {
      throw new Error(`Schedule ${this._id} is already ${this._status}`);
    }
    const payload: SchedulePublishedPayload = {
      scheduleId: this._id,
      publishedAt: new Date().toISOString(),
      publishedBy,
    };
    const event = createEventEnvelope({
      type: MesEventType.SCHEDULE_PUBLISHED,
      source: SOURCE,
      aggregateId: this._id,
      aggregateType: AGGREGATE_TYPE,
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
      case MesEventType.SCHEDULE_CREATED:
      case 'scheduling.schedule.created': {
        const d = event.data as ScheduleCreatedPayload;
        this._name = d.name;
        this._shiftDate = new Date(d.shiftDate);
        this._status = 'DRAFT';
        break;
      }
      case MesEventType.SCHEDULE_ORDER_INSERTED:
      case 'scheduling.order.scheduled': {
        const d = event.data as ScheduleOrderInsertedPayload;
        this._entries.set(d.entryId, {
          entryId: d.entryId,
          orderId: d.orderId,
          workCenterId: d.workCenterId,
          priority: d.priority,
          plannedStartAt: new Date(d.plannedStartAt),
          plannedEndAt: new Date(d.plannedEndAt),
          status: 'PLANNED',
        });
        break;
      }
      case MesEventType.SCHEDULE_ORDER_RESCHEDULED:
      case 'scheduling.entry.rescheduled': {
        const d = event.data as ScheduleEntryRescheduledPayload;
        const rEntry = this._entries.get(d.entryId);
        if (rEntry) {
          rEntry.plannedStartAt = new Date(d.newStartAt);
          rEntry.plannedEndAt = new Date(d.newEndAt);
        }
        break;
      }
      case 'scheduling.entry.cancelled': {
        const d = event.data as ScheduleEntryCancelledPayload;
        const cEntry = this._entries.get(d.entryId);
        if (cEntry) cEntry.status = 'CANCELLED';
        break;
      }
      case MesEventType.SCHEDULE_PUBLISHED:
      case 'scheduling.schedule.published': {
        this._status = 'PUBLISHED';
        break;
      }
    }
  }

  static rehydrate(events: EventEnvelope[]): ProductionScheduleAggregate {
    if (events.length === 0) {
      throw new Error('Cannot rehydrate aggregate from empty event stream');
    }
    const firstData = events[0]?.data as { scheduleId: string };
    const agg = new ProductionScheduleAggregate(firstData.scheduleId ?? '');
    for (const e of events) agg.apply(e);
    return agg;
  }

  popUncommittedEvents(): EventEnvelope[] {
    const events = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return events;
  }

  hasConflict(
    workCenterId: string,
    start: Date,
    end: Date,
    excludeEntryId?: string,
  ): boolean {
    for (const entry of this._entries.values()) {
      if (excludeEntryId && entry.entryId === excludeEntryId) continue;
      if (entry.status === 'CANCELLED') continue;
      if (entry.workCenterId !== workCenterId) continue;
      if (start < entry.plannedEndAt && end > entry.plannedStartAt) return true;
    }
    return false;
  }

  get id(): string { return this._id; }
  get name(): string { return this._name; }
  get status(): ScheduleStatus { return this._status; }
  get entries(): Map<string, ScheduleEntry> { return this._entries; }
  get sequence(): number { return this._sequence; }
}
