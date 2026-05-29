import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type ScheduleOrderStatus = 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ScheduleEntry {
  entryId: string;
  orderId: string;
  workCenterId: string;
  priority: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
  status: ScheduleOrderStatus;
}

export interface ScheduleOrderInsertedPayload {
  scheduleId: string;
  entryId: string;
  orderId: string;
  workCenterId: string;
  priority: number;
  plannedStartAt: string;
  plannedEndAt: string;
  insertedBy: string;
  insertedAt: string;
}

/**
 * ProductionSchedule aggregate — the master schedule for a shift/day/week.
 * Re-planning produces a new version of the schedule (SCHEDULE_REPLANNED event).
 */
export class ProductionScheduleAggregate {
  private _id: string;
  private _entries: Map<string, ScheduleEntry> = new Map();
  private _sequence: number = 0;
  private _uncommitted: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: { name: string; shiftDate: Date; correlationId?: string }): ProductionScheduleAggregate {
    const id = uuidv4();
    const agg = new ProductionScheduleAggregate(id);
    agg.applyAndRecord(createEventEnvelope({ type: MesEventType.SCHEDULE_CREATED, source: 'urn:mes:scheduling-service:ProductionSchedule', aggregateId: id, aggregateType: 'ProductionSchedule', sequence: 1, data: { scheduleId: id, name: params.name, shiftDate: params.shiftDate.toISOString(), createdAt: new Date().toISOString() }, correlationId: params.correlationId }));
    return agg;
  }

  insertOrder(params: { orderId: string; workCenterId: string; priority: number; plannedStartAt: Date; plannedEndAt: Date; insertedBy: string; correlationId?: string }): string {
    // Check for capacity conflicts (simplified: just check overlapping entries for same work center)
    const conflicts = [...this._entries.values()].filter(e =>
      e.workCenterId === params.workCenterId &&
      e.plannedStartAt < params.plannedEndAt &&
      e.plannedEndAt > params.plannedStartAt
    );
    if (conflicts.length > 0) throw new Error(`Work center ${params.workCenterId} is not available in requested time window`);

    const entryId = uuidv4();
    const payload: ScheduleOrderInsertedPayload = { scheduleId: this._id, entryId, orderId: params.orderId, workCenterId: params.workCenterId, priority: params.priority, plannedStartAt: params.plannedStartAt.toISOString(), plannedEndAt: params.plannedEndAt.toISOString(), insertedBy: params.insertedBy, insertedAt: new Date().toISOString() };
    this.applyAndRecord(createEventEnvelope({ type: MesEventType.SCHEDULE_ORDER_INSERTED, source: 'urn:mes:scheduling-service:ProductionSchedule', aggregateId: this._id, aggregateType: 'ProductionSchedule', sequence: this._sequence + 1, data: payload, correlationId: params.correlationId }));
    return entryId;
  }

  private applyAndRecord(e: EventEnvelope): void { this.apply(e); this._uncommitted.push(e); }
  apply(e: EventEnvelope): void {
    this._sequence = e.sequence;
    if (e.type === MesEventType.SCHEDULE_ORDER_INSERTED) {
      const d = e.data as ScheduleOrderInsertedPayload;
      this._entries.set(d.entryId, { entryId: d.entryId, orderId: d.orderId, workCenterId: d.workCenterId, priority: d.priority, plannedStartAt: new Date(d.plannedStartAt), plannedEndAt: new Date(d.plannedEndAt), status: 'PLANNED' });
    }
  }
  static rehydrate(events: EventEnvelope[]): ProductionScheduleAggregate {
    const agg = new ProductionScheduleAggregate((events[0]?.data as any)?.scheduleId ?? '');
    for (const e of events) agg.apply(e);
    return agg;
  }
  get id() { return this._id; }
  get entryCount() { return this._entries.size; }
  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommitted]; this._uncommitted = []; return e; }
}
