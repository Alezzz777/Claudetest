import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type EquipmentStatus = 'AVAILABLE' | 'UNDER_MAINTENANCE' | 'DOWN';
export type WorkOrderType = 'CORRECTIVE' | 'PREVENTIVE' | 'PREDICTIVE';

export const EQUIPMENT_CREATED_TYPE = 'maintenance.equipment.created';
export const EQUIPMENT_RUNTIME_UPDATED_TYPE = 'maintenance.equipment.runtime.updated';
export const EQUIPMENT_THRESHOLD_EXCEEDED_TYPE = 'maintenance.equipment.threshold-exceeded';
export const EQUIPMENT_DOWN_TYPE = 'maintenance.equipment.down';
export const EQUIPMENT_RESTORED_TYPE = 'maintenance.equipment.restored';

export interface EquipmentCreatedPayload {
  equipmentId: string;
  name: string;
  workCenterId: string;
  maintenanceThresholdHours: number;
  tenantId: string;
}

export interface EquipmentRuntimeUpdatedPayload {
  equipmentId: string;
  runtimeHours: number;
  cumulativeRuntimeHours?: number;
  cycleCount?: number;
}

export interface EquipmentDownPayload {
  equipmentId: string;
  workOrderId: string;
}

export interface EquipmentRestoredPayload {
  equipmentId: string;
}

export class EquipmentAggregate {
  private _id: string;
  _name: string = '';
  _workCenterId: string = '';
  _status: EquipmentStatus = 'AVAILABLE';
  _runtimeHours: number = 0;
  _maintenanceThresholdHours: number = 0;
  _tenantId: string = '';
  private _sequence: number = 0;
  _uncommittedEvents: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: { name: string; workCenterId: string; maintenanceThresholdHours: number; tenantId: string; correlationId?: string }): EquipmentAggregate {
    const id = uuidv4();
    const agg = new EquipmentAggregate(id);
    const payload: EquipmentCreatedPayload = { equipmentId: id, name: params.name, workCenterId: params.workCenterId, maintenanceThresholdHours: params.maintenanceThresholdHours, tenantId: params.tenantId };
    const event = createEventEnvelope({ type: EQUIPMENT_CREATED_TYPE, source: 'urn:mes:maintenance-service:Equipment', aggregateId: id, aggregateType: 'Equipment', sequence: 1, data: payload, correlationId: params.correlationId, tenantId: params.tenantId });
    agg.apply(event);
    agg._uncommittedEvents.push(event);
    return agg;
  }

  recordRuntime(hours: number, correlationId?: string): void {
    const previousHours = this._runtimeHours;
    const newHours = previousHours + hours;
    const runtimeEvent = createEventEnvelope({ type: EQUIPMENT_RUNTIME_UPDATED_TYPE, source: 'urn:mes:maintenance-service:Equipment', aggregateId: this._id, aggregateType: 'Equipment', sequence: this._sequence + 1, data: { equipmentId: this._id, runtimeHours: newHours } as EquipmentRuntimeUpdatedPayload, correlationId });
    this.apply(runtimeEvent);
    this._uncommittedEvents.push(runtimeEvent);
    if (this._runtimeHours >= this._maintenanceThresholdHours && previousHours < this._maintenanceThresholdHours && this._status === 'AVAILABLE') {
      const thresholdEvent = createEventEnvelope({ type: EQUIPMENT_THRESHOLD_EXCEEDED_TYPE, source: 'urn:mes:maintenance-service:Equipment', aggregateId: this._id, aggregateType: 'Equipment', sequence: this._sequence + 1, data: { equipmentId: this._id, runtimeHours: this._runtimeHours, threshold: this._maintenanceThresholdHours }, correlationId });
      this.apply(thresholdEvent);
      this._uncommittedEvents.push(thresholdEvent);
    }
  }

  setUnderMaintenance(workOrderId: string, correlationId?: string): void {
    if (this._status === 'UNDER_MAINTENANCE') throw new Error(`Equipment ${this._id} is already under maintenance`);
    const event = createEventEnvelope({ type: EQUIPMENT_DOWN_TYPE, source: 'urn:mes:maintenance-service:Equipment', aggregateId: this._id, aggregateType: 'Equipment', sequence: this._sequence + 1, data: { equipmentId: this._id, workOrderId } as EquipmentDownPayload, correlationId });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  restore(correlationId?: string): void {
    if (this._status !== 'UNDER_MAINTENANCE' && this._status !== 'DOWN') throw new Error(`Equipment ${this._id} is not under maintenance or down`);
    const event = createEventEnvelope({ type: EQUIPMENT_RESTORED_TYPE, source: 'urn:mes:maintenance-service:Equipment', aggregateId: this._id, aggregateType: 'Equipment', sequence: this._sequence + 1, data: { equipmentId: this._id } as EquipmentRestoredPayload, correlationId });
    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  apply(event: EventEnvelope): void {
    this._sequence = event.sequence;
    switch (event.type) {
      case EQUIPMENT_CREATED_TYPE: {
        const d = event.data as EquipmentCreatedPayload;
        this._id = d.equipmentId;
        this._name = d.name;
        this._workCenterId = d.workCenterId;
        this._maintenanceThresholdHours = d.maintenanceThresholdHours;
        this._tenantId = d.tenantId;
        this._status = 'AVAILABLE';
        break;
      }
      case EQUIPMENT_RUNTIME_UPDATED_TYPE: {
        const d = event.data as EquipmentRuntimeUpdatedPayload;
        this._runtimeHours = d.runtimeHours;
        break;
      }
      case EQUIPMENT_THRESHOLD_EXCEEDED_TYPE: break;
      case EQUIPMENT_DOWN_TYPE: this._status = 'UNDER_MAINTENANCE'; break;
      case EQUIPMENT_RESTORED_TYPE: this._status = 'AVAILABLE'; this._runtimeHours = 0; break;
    }
  }

  static rehydrate(events: EventEnvelope[]): EquipmentAggregate {
    const firstData = events[0]?.data as { equipmentId?: string } | undefined;
    const id = firstData?.equipmentId ?? (events[0]?.aggregateId ?? '');
    const agg = new EquipmentAggregate(id);
    for (const e of events) agg.apply(e);
    return agg;
  }

  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommittedEvents]; this._uncommittedEvents = []; return e; }

  get id() { return this._id; }
  get name() { return this._name; }
  get status() { return this._status; }
  get runtimeHours() { return this._runtimeHours; }
  get sequence() { return this._sequence; }
  get workCenterId() { return this._workCenterId; }
  get tenantId() { return this._tenantId; }
  get maintenanceThresholdHours() { return this._maintenanceThresholdHours; }
}
