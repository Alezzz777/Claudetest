import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type WorkOrderStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type WorkOrderType = 'CORRECTIVE' | 'PREVENTIVE' | 'PREDICTIVE';

export const WORK_ORDER_CREATED_TYPE = MesEventType.MAINTENANCE_WORK_ORDER_CREATED;
export const WORK_ORDER_STARTED_TYPE = 'maintenance.work-order.started';
export const WORK_ORDER_COMPLETED_TYPE = MesEventType.MAINTENANCE_WORK_ORDER_COMPLETED;
export const WORK_ORDER_CANCELLED_TYPE = 'maintenance.work-order.cancelled';
export const WORK_ORDER_PLANNED_TYPE = 'maintenance.work-order.planned';

export interface WorkOrderCreatedPayload {
  workOrderId: string;
  equipmentId: string;
  workOrderNo: string;
  type: WorkOrderType;
  description: string;
  createdBy: string;
}

export interface WorkOrderPlannedPayload {
  workOrderId: string;
  plannedStart: string;
  plannedEnd: string;
  assignedTo: string;
}

export interface WorkOrderStartedPayload {
  workOrderId: string;
  actualStart: string;
}

export interface WorkOrderCompletedPayload {
  workOrderId: string;
  resolution: string;
  completedBy: string;
  actualEnd: string;
}

export interface WorkOrderCancelledPayload {
  workOrderId: string;
  reason: string;
  cancelledBy: string;
}

export class WorkOrderAggregate {
  private _id: string;
  _equipmentId: string = '';
  _workOrderNo: string = '';
  _type: WorkOrderType = 'CORRECTIVE';
  _status: WorkOrderStatus = 'DRAFT';
  _description: string = '';
  _assignedTo: string | null = null;
  _plannedStart: Date | null = null;
  _plannedEnd: Date | null = null;
  _actualStart: Date | null = null;
  _actualEnd: Date | null = null;
  _createdBy: string = '';
  private _sequence: number = 0;
  _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: {
    equipmentId: string;
    workOrderNo: string;
    type: WorkOrderType;
    description: string;
    createdBy: string;
    correlationId?: string;
  }): WorkOrderAggregate {
    const id = uuidv4();
    const agg = new WorkOrderAggregate(id);
    const payload: WorkOrderCreatedPayload = {
      workOrderId: id,
      equipmentId: params.equipmentId,
      workOrderNo: params.workOrderNo,
      type: params.type,
      description: params.description,
      createdBy: params.createdBy,
    };
    const event = createEventEnvelope({
      type: WORK_ORDER_CREATED_TYPE,
      source: 'urn:mes:maintenance-service:WorkOrder',
      aggregateId: id,
      aggregateType: 'WorkOrder',
      sequence: 1,
      data: payload,
      correlationId: params.correlationId,
    });
    agg.apply(event);
    agg._uncommittedEvents.push(event);
    return agg;
  }

  plan(plannedStart: Date, plannedEnd: Date, assignedTo: string, correlationId?: string): void {
    const payload: WorkOrderPlannedPayload = {
      workOrderId: this._id,
      plannedStart: plannedStart.toISOString(),
      plannedEnd: plannedEnd.toISOString(),
      assignedTo,
    };
    const event = createEventEnvelope({
      type: WORK_ORDER_PLANNED_TYPE,
      source: 'urn:mes:maintenance-service:WorkOrder',
      aggregateId: this._id,
      aggregateType: 'WorkOrder',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  start(correlationId?: string): void {
    if (this._status !== 'PLANNED') {
      throw new Error(`WorkOrder ${this._id} cannot be started from status ${this._status}`);
    }
    const payload: WorkOrderStartedPayload = {
      workOrderId: this._id,
      actualStart: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: WORK_ORDER_STARTED_TYPE,
      source: 'urn:mes:maintenance-service:WorkOrder',
      aggregateId: this._id,
      aggregateType: 'WorkOrder',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  complete(resolution: string, completedBy: string, correlationId?: string): void {
    if (this._status !== 'IN_PROGRESS') {
      throw new Error(`WorkOrder ${this._id} cannot be completed from status ${this._status}`);
    }
    const payload: WorkOrderCompletedPayload = {
      workOrderId: this._id,
      resolution,
      completedBy,
      actualEnd: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: WORK_ORDER_COMPLETED_TYPE,
      source: 'urn:mes:maintenance-service:WorkOrder',
      aggregateId: this._id,
      aggregateType: 'WorkOrder',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  cancel(reason: string, cancelledBy: string, correlationId?: string): void {
    if (this._status === 'COMPLETED' || this._status === 'CANCELLED') return;
    const payload: WorkOrderCancelledPayload = {
      workOrderId: this._id,
      reason,
      cancelledBy,
    };
    const event = createEventEnvelope({
      type: WORK_ORDER_CANCELLED_TYPE,
      source: 'urn:mes:maintenance-service:WorkOrder',
      aggregateId: this._id,
      aggregateType: 'WorkOrder',
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
      case WORK_ORDER_CREATED_TYPE: {
        const d = event.data as WorkOrderCreatedPayload;
        this._id = d.workOrderId;
        this._equipmentId = d.equipmentId;
        this._workOrderNo = d.workOrderNo;
        this._type = d.type;
        this._description = d.description;
        this._createdBy = d.createdBy;
        this._status = 'DRAFT';
        break;
      }
      case WORK_ORDER_PLANNED_TYPE: {
        const d = event.data as WorkOrderPlannedPayload;
        this._plannedStart = new Date(d.plannedStart);
        this._plannedEnd = new Date(d.plannedEnd);
        this._assignedTo = d.assignedTo;
        this._status = 'PLANNED';
        break;
      }
      case WORK_ORDER_STARTED_TYPE: {
        const d = event.data as WorkOrderStartedPayload;
        this._actualStart = new Date(d.actualStart);
        this._status = 'IN_PROGRESS';
        break;
      }
      case WORK_ORDER_COMPLETED_TYPE: {
        const d = event.data as WorkOrderCompletedPayload;
        this._actualEnd = new Date(d.actualEnd);
        this._status = 'COMPLETED';
        break;
      }
      case WORK_ORDER_CANCELLED_TYPE: {
        this._status = 'CANCELLED';
        break;
      }
    }
  }

  static rehydrate(events: EventEnvelope[]): WorkOrderAggregate {
    const firstData = events[0]?.data as { workOrderId?: string } | undefined;
    const id = firstData?.workOrderId ?? (events[0]?.aggregateId ?? '');
    const agg = new WorkOrderAggregate(id);
    for (const e of events) agg.apply(e);
    return agg;
  }

  popUncommittedEvents(): EventEnvelope[] {
    const e = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return e;
  }

  get id() { return this._id; }
  get equipmentId() { return this._equipmentId; }
  get workOrderNo() { return this._workOrderNo; }
  get type() { return this._type; }
  get status() { return this._status; }
  get description() { return this._description; }
  get sequence() { return this._sequence; }
}
