import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type WorkOrderStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type WorkOrderType = 'CORRECTIVE' | 'PREVENTIVE' | 'PREDICTIVE';

export interface WorkOrderCreatedPayload {
  equipmentId: string;
  workOrderId: string;
  workOrderType: WorkOrderType;
  description: string;
  priority: number;
  plannedStartAt: string;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
}

export interface EquipmentRuntimeUpdatedPayload {
  equipmentId: string;
  cumulativeRuntimeHours: number;
  cycleCount: number;
  lastUpdatedAt: string;
  source: 'OPC_UA' | 'MANUAL' | 'SPARKPLUG';
}

/**
 * Equipment aggregate — tracks runtime counters and maintenance work orders.
 * Runtime data comes from integration-service (OPC-UA / Sparkplug telemetry).
 */
export class EquipmentAggregate {
  private _id: string;
  private _runtimeHours: number = 0;
  private _cycleCount: number = 0;
  private _workOrders: string[] = [];
  private _sequence: number = 0;
  private _uncommitted: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  createWorkOrder(params: {
    workOrderType: WorkOrderType;
    description: string;
    priority: number;
    plannedStartAt: Date;
    createdBy: string;
    correlationId?: string;
  }): string {
    const workOrderId = uuidv4();
    const payload: WorkOrderCreatedPayload = {
      equipmentId: this._id,
      workOrderId,
      workOrderType: params.workOrderType,
      description: params.description,
      priority: params.priority,
      plannedStartAt: params.plannedStartAt.toISOString(),
      assignedTo: null,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.applyAndRecord(createEventEnvelope({
      type: MesEventType.MAINTENANCE_WORK_ORDER_CREATED,
      source: 'urn:mes:maintenance-service:Equipment',
      aggregateId: this._id,
      aggregateType: 'Equipment',
      sequence: this._sequence + 1,
      data: payload,
      correlationId: params.correlationId,
    }));
    return workOrderId;
  }

  updateRuntime(runtimeHours: number, cycleCount: number, source: 'OPC_UA' | 'MANUAL' | 'SPARKPLUG', correlationId?: string): void {
    const payload: EquipmentRuntimeUpdatedPayload = {
      equipmentId: this._id,
      cumulativeRuntimeHours: runtimeHours,
      cycleCount,
      lastUpdatedAt: new Date().toISOString(),
      source,
    };
    this.applyAndRecord(createEventEnvelope({
      type: MesEventType.MAINTENANCE_EQUIPMENT_RUNTIME_UPDATED,
      source: 'urn:mes:maintenance-service:Equipment',
      aggregateId: this._id,
      aggregateType: 'Equipment',
      sequence: this._sequence + 1,
      data: payload,
      correlationId,
    }));
  }

  private applyAndRecord(e: EventEnvelope): void { this.apply(e); this._uncommitted.push(e); }

  apply(e: EventEnvelope): void {
    this._sequence = e.sequence;
    if (e.type === MesEventType.MAINTENANCE_WORK_ORDER_CREATED) {
      this._workOrders.push((e.data as WorkOrderCreatedPayload).workOrderId);
    }
    if (e.type === MesEventType.MAINTENANCE_EQUIPMENT_RUNTIME_UPDATED) {
      const d = e.data as EquipmentRuntimeUpdatedPayload;
      this._runtimeHours = d.cumulativeRuntimeHours;
      this._cycleCount = d.cycleCount;
    }
  }

  static rehydrate(events: EventEnvelope[]): EquipmentAggregate {
    const id = (events[0]?.data as { equipmentId: string })?.equipmentId ?? '';
    const agg = new EquipmentAggregate(id);
    for (const e of events) agg.apply(e);
    return agg;
  }

  get id() { return this._id; }
  get runtimeHours() { return this._runtimeHours; }
  get cycleCount() { return this._cycleCount; }
  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommitted]; this._uncommitted = []; return e; }
}
