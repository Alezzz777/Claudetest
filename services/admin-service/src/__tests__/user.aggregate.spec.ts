import { describe, it, expect, beforeEach } from 'vitest';
import { UserAggregate } from '../domain/user.aggregate';
import { MesEventType } from '@mes/shared';

const baseParams = {
  email: 'test@example.com',
  displayName: 'Test User',
  keycloakId: 'kc-123',
  tenantId: 'tenant-1',
  correlationId: 'corr-1',
};

describe('UserAggregate', () => {
  it('create() produces 1 uncommitted event of type ADMIN_USER_CREATED', () => {
    const user = UserAggregate.create(baseParams);
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.ADMIN_USER_CREATED);
  });

  it('assignRole() idempotency: assigning same role twice → 1 event total', () => {
    const user = UserAggregate.create(baseParams);
    user.popUncommittedEvents(); // clear create event

    user.assignRole('ADMIN', 'GLOBAL', null, 'system');
    user.assignRole('ADMIN', 'GLOBAL', null, 'system'); // same role
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.ADMIN_USER_ROLE_ASSIGNED);
  });

  it('assignRole() different roles → 2 events', () => {
    const user = UserAggregate.create(baseParams);
    user.popUncommittedEvents();

    user.assignRole('ADMIN', 'GLOBAL', null, 'system');
    user.assignRole('OPERATOR', 'GLOBAL', null, 'system');
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(2);
  });

  it('deactivate() on active user → emits ADMIN_USER_DEACTIVATED', () => {
    const user = UserAggregate.create(baseParams);
    user.popUncommittedEvents();

    user.deactivate('corr-2');
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(MesEventType.ADMIN_USER_DEACTIVATED);
    expect(user.isActive).toBe(false);
  });

  it('deactivate() on already-deactivated user → no new event (noop)', () => {
    const user = UserAggregate.create(baseParams);
    user.popUncommittedEvents();

    user.deactivate('corr-2');
    user.popUncommittedEvents(); // clear deactivate event

    user.deactivate('corr-3');
    const events = user.popUncommittedEvents();
    expect(events).toHaveLength(0);
  });

  it('rehydrate() restores roles and isActive', () => {
    const original = UserAggregate.create(baseParams);
    original.assignRole('ADMIN', 'GLOBAL', null, 'system');
    original.deactivate('corr-x');

    const allEvents = original.popUncommittedEvents();

    const restored = UserAggregate.rehydrate(allEvents);
    expect(restored.roles).toContain('ADMIN');
    expect(restored.isActive).toBe(false);
    expect(restored.email).toBe(baseParams.email);
  });

  it('version increments correctly with each event', () => {
    const user = UserAggregate.create(baseParams);
    expect(user.getVersion()).toBe(1);

    user.assignRole('ADMIN', 'GLOBAL', null, 'system');
    expect(user.getVersion()).toBe(2);

    user.deactivate();
    expect(user.getVersion()).toBe(3);
  });

  it('popUncommittedEvents() clears the queue', () => {
    const user = UserAggregate.create(baseParams);
    const first = user.popUncommittedEvents();
    expect(first).toHaveLength(1);

    const second = user.popUncommittedEvents();
    expect(second).toHaveLength(0);
  });
});
