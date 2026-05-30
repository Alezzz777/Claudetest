import { v4 as uuidv4 } from 'uuid';
import { AggregateRoot, EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

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

export interface UserDeactivatedPayload {
  userId: string;
  deactivatedAt: string;
}

/**
 * User aggregate — manages user roles within the MES.
 * Authentication is delegated to Keycloak; this aggregate manages MES-specific RBAC.
 * Extends shared AggregateRoot for event-sourcing support.
 */
export class UserAggregate extends AggregateRoot {
  private _email: string = '';
  private _keycloakId: string = '';
  private _roles: Set<MesRole> = new Set();
  private _isActive: boolean = true;

  constructor() {
    super();
  }

  getAggregateType(): string {
    return 'User';
  }

  protected handleEvent(event: EventEnvelope): void {
    switch (event.type) {
      case MesEventType.ADMIN_USER_CREATED:
        this._onUserCreated(event.data as UserCreatedPayload, event);
        break;
      case MesEventType.ADMIN_USER_ROLE_ASSIGNED:
        this._onRoleAssigned(event.data as UserRoleAssignedPayload);
        break;
      case MesEventType.ADMIN_USER_DEACTIVATED:
        this._onUserDeactivated();
        break;
    }
  }

  private _onUserCreated(d: UserCreatedPayload, event: EventEnvelope): void {
    this._id = d.userId;
    this._email = d.email;
    this._keycloakId = d.keycloakId;
    this._isActive = true;
  }

  private _onRoleAssigned(d: UserRoleAssignedPayload): void {
    this._roles.add(d.role);
  }

  private _onUserDeactivated(): void {
    this._isActive = false;
  }

  static create(params: {
    email: string;
    displayName: string;
    keycloakId: string;
    tenantId: string;
    correlationId?: string;
  }): UserAggregate {
    const id = uuidv4();
    const agg = new UserAggregate();
    agg._id = id;
    agg.apply(
      createEventEnvelope({
        type: MesEventType.ADMIN_USER_CREATED,
        source: 'urn:mes:admin-service:User',
        aggregateId: id,
        aggregateType: 'User',
        sequence: 1,
        data: {
          userId: id,
          email: params.email,
          displayName: params.displayName,
          keycloakId: params.keycloakId,
          tenantId: params.tenantId,
          createdAt: new Date().toISOString(),
        } as UserCreatedPayload,
        correlationId: params.correlationId,
      }),
    );
    return agg;
  }

  assignRole(
    role: MesRole,
    scopeType: 'GLOBAL' | 'SITE' | 'AREA',
    scopeId: string | null,
    assignedBy: string,
    correlationId?: string,
  ): void {
    if (this._roles.has(role)) return; // idempotent
    const payload: UserRoleAssignedPayload = {
      userId: this._id,
      role,
      scopeType,
      scopeId,
      assignedBy,
      assignedAt: new Date().toISOString(),
    };
    this.apply(
      createEventEnvelope({
        type: MesEventType.ADMIN_USER_ROLE_ASSIGNED,
        source: 'urn:mes:admin-service:User',
        aggregateId: this._id,
        aggregateType: 'User',
        sequence: this._version + 1,
        data: payload,
        correlationId,
      }),
    );
  }

  deactivate(correlationId?: string): void {
    if (!this._isActive) return; // noop if already inactive
    const payload: UserDeactivatedPayload = {
      userId: this._id,
      deactivatedAt: new Date().toISOString(),
    };
    this.apply(
      createEventEnvelope({
        type: MesEventType.ADMIN_USER_DEACTIVATED,
        source: 'urn:mes:admin-service:User',
        aggregateId: this._id,
        aggregateType: 'User',
        sequence: this._version + 1,
        data: payload,
        correlationId,
      }),
    );
  }

  get id(): string { return this._id; }
  get email(): string { return this._email; }
  get roles(): MesRole[] { return [...this._roles]; }
  get isActive(): boolean { return this._isActive; }
}
