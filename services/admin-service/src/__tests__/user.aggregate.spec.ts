import { describe, it, expect, beforeEach } from 'vitest';
import { UserAggregate } from '../domain/user.aggregate';
import { MesEventType } from '@mes/shared';

const BASE = {
  email: 'test@mes.local',
  displayName: 'Test User',
  keycloakId: 'kc-123',
  tenantId: 'tenant-1',
};

describe('UserAggregate', () => {
  it('create() produces 1 uncommitted UserCreated event', () => {
    const user = UserAggregate.create(BASE);
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.ADMIN_USER_CREATED);
    expect((events[0]!.data as any).email).toBe(BASE.email);
  });

  it('version is 1 after create()', () => {
    const user = UserAggregate.create(BASE);
    expect(user.getVersion()).toBe(1);
  });

  it('assignRole() emits RoleAssigned event', () => {
    const user = UserAggregate.create(BASE);
    user.popUncommittedEvents(); // clear
    user.assignRole('OPERATOR', 'GLOBAL', null, 'admin');
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.ADMIN_USER_ROLE_ASSIGNED);
    expect(user.roles).toContain('OPERATOR');
  });

  it('assignRole() is idempotent — same role twice emits 1 event total', () => {
    const user = UserAggregate.create(BASE);
    user.popUncommittedEvents();
    user.assignRole('OPERATOR', 'GLOBAL', null, 'admin');
    user.assignRole('OPERATOR', 'GLOBAL', null, 'admin'); // duplicate
    expect(user.popUncommittedEvents()).toHaveLength(1);
    expect(user.roles).toEqual(['OPERATOR']);
  });

  it('assignRole() different roles → 2 events', () => {
    const user = UserAggregate.create(BASE);
    user.popUncommittedEvents();
    user.assignRole('OPERATOR', 'GLOBAL', null, 'admin');
    user.assignRole('DISPATCHER', 'GLOBAL', null, 'admin');
    expect(user.popUncommittedEvents()).toHaveLength(2);
  });

  it('deactivate() on active user emits Deactivated event', () => {
    const user = UserAggregate.create(BASE);
    user.popUncommittedEvents();
    user.deactivate();
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.ADMIN_USER_DEACTIVATED);
    expect(user.isActive).toBe(false);
  });

  it('deactivate() on already-inactive user is a noop', () => {
    const user = UserAggregate.create(BASE);
    user.popUncommittedEvents();
    user.deactivate();
    user.popUncommittedEvents(); // clear
    user.deactivate(); // second call
    expect(user.popUncommittedEvents()).toHaveLength(0);
  });

  it('rehydrate() restores state from event history', () => {
    const original = UserAggregate.create(BASE);
    original.assignRole('ADMIN', 'GLOBAL', null, 'system');
    original.deactivate();
    const history = original.popUncommittedEvents();

    const restored = UserAggregate.rehydrate(history);
    expect(restored.email).toBe(BASE.email);
    expect(restored.roles).toContain('ADMIN');
    expect(restored.isActive).toBe(false);
    expect(restored.popUncommittedEvents()).toHaveLength(0); // rehydrate clears uncommitted
  });

  it('getVersion() tracks each applied event', () => {
    const user = UserAggregate.create(BASE);
    expect(user.getVersion()).toBe(1);
    user.assignRole('OPERATOR', 'GLOBAL', null, 'admin');
    expect(user.getVersion()).toBe(2);
    user.deactivate();
    expect(user.getVersion()).toBe(3);
    user.popUncommittedEvents();
    expect(user.getVersion()).toBe(3); // pop doesn't change version
  });
});
