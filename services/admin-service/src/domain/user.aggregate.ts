import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type MesRole = 'OPERATOR' | 'DISPATCHER' | 'QUALITY_CONTROLLER' | 'MAINTENANCE_TECH' | 'ENGINEER' | 'ADMIN' | 'VIEWER';

export interface UserCreatedPayload {
  userId: string;
  email: string;
  displayName: string;
  keycloakId: string;
  tenantId: string;
  createdAt: string;
}

export interface UserRoleAssignedPayload {
  userId: string;
  role: MesRole;
  scopeType: 'GLOBAL' | 'SITE' | 'AREA';
  scopeId: string | null;
  assignedBy: string;
  assignedAt: string;
}

/**
 * User aggregate — manages user roles within the MES.
 * Authentication is delegated to Keycloak; this aggregate manages MES-specific RBAC.
 */
export class UserAggregate {
  private _id: string;
  private _email: string = '';
  private _keycloakId: string = '';
  private _roles: Set<MesRole> = new Set();
  private _sequence: number = 0;
  private _uncommitted: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: { email: string; displayName: string; keycloakId: string; tenantId: string; correlationId?: string }): UserAggregate {
    const id = uuidv4();
    const agg = new UserAggregate(id);
    agg.applyAndRecord(createEventEnvelope({ type: MesEventType.ADMIN_USER_CREATED, source: 'urn:mes:admin-service:User', aggregateId: id, aggregateType: 'User', sequence: 1, data: { userId: id, email: params.email, displayName: params.displayName, keycloakId: params.keycloakId, tenantId: params.tenantId, createdAt: new Date().toISOString() } as UserCreatedPayload, correlationId: params.correlationId }));
    return agg;
  }

  assignRole(role: MesRole, scopeType: 'GLOBAL' | 'SITE' | 'AREA', scopeId: string | null, assignedBy: string, correlationId?: string): void {
    if (this._roles.has(role)) return; // idempotent - role already assigned
    const payload: UserRoleAssignedPayload = { userId: this._id, role, scopeType, scopeId, assignedBy, assignedAt: new Date().toISOString() };
    this.applyAndRecord(createEventEnvelope({ type: MesEventType.ADMIN_USER_ROLE_ASSIGNED, source: 'urn:mes:admin-service:User', aggregateId: this._id, aggregateType: 'User', sequence: this._sequence + 1, data: payload, correlationId }));
  }

  private applyAndRecord(e: EventEnvelope): void { this.apply(e); this._uncommitted.push(e); }
  apply(e: EventEnvelope): void {
    this._sequence = e.sequence;
    if (e.type === MesEventType.ADMIN_USER_CREATED) { const d = e.data as UserCreatedPayload; this._email = d.email; this._keycloakId = d.keycloakId; }
    if (e.type === MesEventType.ADMIN_USER_ROLE_ASSIGNED) { this._roles.add((e.data as UserRoleAssignedPayload).role); }
  }
  static rehydrate(events: EventEnvelope[]): UserAggregate {
    const agg = new UserAggregate((events[0]?.data as any)?.userId ?? '');
    for (const e of events) agg.apply(e);
    return agg;
  }
  get id() { return this._id; }
  get roles(): MesRole[] { return [...this._roles]; }
  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommitted]; this._uncommitted = []; return e; }
}
