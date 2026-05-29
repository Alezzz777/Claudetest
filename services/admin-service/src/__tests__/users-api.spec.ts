import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserController } from '../api/user.controller';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { DeactivateUserCommand } from '../application/commands/deactivate-user.command';
import { AssignRoleCommand } from '../application/commands/assign-role.handler';
import { GetUserQuery } from '../application/queries/get-user.handler';
import { ListUsersQuery } from '../application/queries/list-users.handler';

function makeController() {
  const commandBus = { execute: vi.fn().mockResolvedValue('user-id-123') };
  const queryBus = { execute: vi.fn().mockResolvedValue({ userId: 'user-id-123', email: 'a@b.com', displayName: 'A', roles: [], tenantId: 't1' }) };
  const ctrl = new UserController(commandBus as any, queryBus as any);
  return { ctrl, commandBus, queryBus };
}

describe('UserController', () => {
  it('POST /users → dispatches CreateUserCommand', async () => {
    const { ctrl, commandBus } = makeController();
    const result = await ctrl.createUser({
      email: 'test@mes.local',
      displayName: 'Test',
      keycloakId: 'kc-1',
      tenantId: 't1',
    } as any);
    expect(commandBus.execute).toHaveBeenCalledOnce();
    expect(commandBus.execute.mock.calls[0]![0]).toBeInstanceOf(CreateUserCommand);
    expect(result.userId).toBe('user-id-123');
  });

  it('GET /users → dispatches ListUsersQuery', async () => {
    const { ctrl, queryBus } = makeController();
    await ctrl.listUsers('tenant-1', 2, 10);
    expect(queryBus.execute.mock.calls[0]![0]).toBeInstanceOf(ListUsersQuery);
  });

  it('GET /users/:id → dispatches GetUserQuery', async () => {
    const { ctrl, queryBus } = makeController();
    await ctrl.getUser('user-id-123');
    expect(queryBus.execute.mock.calls[0]![0]).toBeInstanceOf(GetUserQuery);
  });

  it('DELETE /users/:id → dispatches DeactivateUserCommand', async () => {
    const { ctrl, commandBus } = makeController();
    await ctrl.deactivateUser('user-id-123');
    expect(commandBus.execute.mock.calls[0]![0]).toBeInstanceOf(DeactivateUserCommand);
  });

  it('POST /users/:id/roles → dispatches AssignRoleCommand', async () => {
    const { ctrl, commandBus } = makeController();
    await ctrl.assignRole('user-id-123', {
      role: 'OPERATOR',
      scopeType: 'GLOBAL',
      assignedBy: 'admin',
    } as any);
    expect(commandBus.execute.mock.calls[0]![0]).toBeInstanceOf(AssignRoleCommand);
  });
});
