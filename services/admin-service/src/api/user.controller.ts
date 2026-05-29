import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsIn, IsUUID } from 'class-validator';
import { AssignRoleCommand } from '../application/commands/assign-role.handler';
import { GetUserQuery, UserReadModel } from '../application/queries/get-user.handler';
import type { MesRole } from '../domain/user.aggregate';

class AssignRoleDto {
  @IsIn(['OPERATOR','DISPATCHER','QUALITY_CONTROLLER','MAINTENANCE_TECH','ENGINEER','ADMIN','VIEWER']) role!: MesRole;
  @IsIn(['GLOBAL','SITE','AREA']) scopeType!: 'GLOBAL' | 'SITE' | 'AREA';
  scopeId?: string | null;
  @IsString() assignedBy!: string;
  @IsUUID() correlationId!: string;
}

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get user with assigned roles' })
  async getUser(@Param('userId') userId: string): Promise<UserReadModel> {
    return this.queryBus.execute(new GetUserQuery(userId));
  }

  @Post(':userId/roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user' })
  async assignRole(@Param('userId') userId: string, @Body() dto: AssignRoleDto): Promise<void> {
    await this.commandBus.execute(new AssignRoleCommand(userId, dto.role, dto.scopeType, dto.scopeId ?? null, dto.assignedBy, dto.correlationId));
  }
}
