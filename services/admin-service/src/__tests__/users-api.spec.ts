import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserController } from '../api/user.controller';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { DeactivateUserCommand } from '../application/commands/deactivate-user.command';
import { AssignRoleCommand } from '../application/commands/assign-role.handler';
import { GetUserQuery } from '../application/queries/get-user.handler';

function makeCommandBus() {
  return { execute: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
}

function makeQueryBus() {
  return {
    execute: vi.fn().mockResolvedValue({
      userId: 'user-1',
      email: 'a@b.com',
      displayName: 'User',
      roles: [],
      tenantId: 't1',
    }),
  };
}

describe('UserController', () => {
  let commandBus: ReturnType<typeof makeCommandBus>;
  let queryBus: ReturnType<typeof makeQueryBus>;
  let controller: UserController;

  beforeEach(() => {
    commandBus = makeCommandBus();
    queryBus = makeQueryBus();
    controller = new UserController(commandBus as never, queryBus as never);
  });

  it('POST /api/v1/users → calls CreateUserCommand', async () => {
    const dto = {
      email: 'a@b.com',
      displayName: 'User',
      keycloakId: 'kc-1',
      tenantId: 't1',
      correlationId: '00000000-0000-0000-0000-000000000001',
    };
    await controller.createUser(dto);
    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateUserCommand));
    const cmd = commandBus.execute.mock.calls[0]![0] as CreateUserCommand;
    expect(cmd.email).toBe(dto.email);
  });

  it('GET /api/v1/users/:id → calls GetUserQuery', async () => {
    await controller.getUser('user-1');
    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetUserQuery));
    const q = queryBus.execute.mock.calls[0]![0] as GetUserQuery;
    expect(q.userId).toBe('user-1');
  });

  it('POST /api/v1/users/:id/roles → calls AssignRoleCommand', async () => {
    const dto = {
      role: 'ADMIN' as const,
      scopeType: 'GLOBAL' as const,
      assignedBy: 'system',
      correlationId: '00000000-0000-0000-0000-000000000002',
    };
    await controller.assignRole('user-1', dto);
    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(AssignRoleCommand));
    const cmd = commandBus.execute.mock.calls[0]![0] as AssignRoleCommand;
    expect(cmd.role).toBe('ADMIN');
  });

  it('DELETE /api/v1/users/:id → calls DeactivateUserCommand', async () => {
    await controller.deactivateUser('user-1', 'corr-x');
    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(DeactivateUserCommand));
    const cmd = commandBus.execute.mock.calls[0]![0] as DeactivateUserCommand;
    expect(cmd.userId).toBe('user-1');
  });
});
