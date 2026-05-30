import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED';

export class DeviceAggregate {
  private _id: string;
  private _status: DeviceStatus = 'OFFLINE';
  private _sequence: number = 0;
  private _uncommitted: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  markOnline(protocol: string, correlationId?: string): void {
    if (this._status === 'ONLINE') return;
    this.applyAndRecord(createEventEnvelope({ type: MesEventType.INTEGRATION_DEVICE_ONLINE, source: 'urn:mes:integration-service:Device', aggregateId: this._id, aggregateType: 'Device', sequence: this._sequence + 1, data: { deviceId: this._id, protocol, onlineAt: new Date().toISOString() }, correlationId }));
  }

  markOffline(protocol: string, correlationId?: string): void {
    if (this._status === 'OFFLINE') return;
    this.applyAndRecord(createEventEnvelope({ type: MesEventType.INTEGRATION_DEVICE_OFFLINE, source: 'urn:mes:integration-service:Device', aggregateId: this._id, aggregateType: 'Device', sequence: this._sequence + 1, data: { deviceId: this._id, protocol, offlineAt: new Date().toISOString() }, correlationId }));
  }

  private applyAndRecord(e: EventEnvelope): void { this.apply(e); this._uncommitted.push(e); }
  apply(e: EventEnvelope): void {
    this._sequence = e.sequence;
    if (e.type === MesEventType.INTEGRATION_DEVICE_ONLINE) this._status = 'ONLINE';
    if (e.type === MesEventType.INTEGRATION_DEVICE_OFFLINE) this._status = 'OFFLINE';
  }
  static rehydrate(events: EventEnvelope[]): DeviceAggregate {
    const id = (events[0]?.data as any)?.deviceId ?? uuidv4();
    const agg = new DeviceAggregate(id);
    for (const e of events) agg.apply(e);
    return agg;
  }
  get id() { return this._id; }
  get status() { return this._status; }
  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommitted]; this._uncommitted = []; return e; }
}
