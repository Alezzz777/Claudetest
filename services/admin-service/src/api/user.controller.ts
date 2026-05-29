import {
  Controller, Get, Post, Delete, Param, Body,
  HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsEmail, IsIn, IsUUID, IsOptional } from 'class-validator';
import { AssignRoleCommand } from '../application/commands/assign-role.handler';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { DeactivateUserCommand } from '../application/commands/deactivate-user.command';
import { GetUserQuery, UserReadModel } from '../application/queries/get-user.handler';
import { ListUsersQuery, ListUsersResult } from '../application/queries/list-users.handler';
import type { MesRole } from '../domain/user.aggregate';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() displayName!: string;
  @IsString() keycloakId!: string;
  @IsString() tenantId!: string;
  @IsUUID() correlationId!: string;
}

class AssignRoleDto {
  @IsIn(['OPERATOR','DISPATCHER','QUALITY_CONTROLLER','MAINTENANCE_TECH','ENGINEER','ADMIN','VIEWER'])
  role!: MesRole;
  @IsIn(['GLOBAL','SITE','AREA']) scopeType!: 'GLOBAL' | 'SITE' | 'AREA';
  @IsOptional() scopeId?: string | null;
  @IsString() assignedBy!: string;
  @IsUUID() correlationId!: string;
}

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new MES user' })
  async createUser(@Body() dto: CreateUserDto): Promise<{ userId: string }> {
    return this.commandBus.execute(
      new CreateUserCommand(dto.email, dto.displayName, dto.keycloakId, dto.tenantId, dto.correlationId),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List users (from read-model projections)' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async listUsers(
    @Query('tenantId') tenantId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ListUsersResult> {
    return this.queryBus.execute(
      new ListUsersQuery(tenantId, page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 20),
    );
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user with assigned roles' })
  async getUser(@Param('userId') userId: string): Promise<UserReadModel> {
    return this.queryBus.execute(new GetUserQuery(userId));
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a user' })
  async deactivateUser(
    @Param('userId') userId: string,
    @Query('correlationId') correlationId?: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeactivateUserCommand(userId, correlationId ?? crypto.randomUUID()),
    );
  }

  @Post(':userId/roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user' })
  async assignRole(@Param('userId') userId: string, @Body() dto: AssignRoleDto): Promise<void> {
    await this.commandBus.execute(
      new AssignRoleCommand(userId, dto.role, dto.scopeType, dto.scopeId ?? null, dto.assignedBy, dto.correlationId),
    );
  }
}
