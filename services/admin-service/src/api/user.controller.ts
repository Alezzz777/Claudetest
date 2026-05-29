import {
  Controller, Get, Post, Delete, Param, Body, Query,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsIn, IsUUID, IsEmail, IsOptional } from 'class-validator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles, RolesGuard } from './guards/roles.guard';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { DeactivateUserCommand } from '../application/commands/deactivate-user.command';
import { AssignRoleCommand } from '../application/commands/assign-role.handler';
import { GetUserQuery, UserReadModel } from '../application/queries/get-user.handler';
import { ListUsersQuery, PaginatedUsers } from '../application/queries/list-users.handler';
import type { MesRole } from '../domain/user.aggregate';
import { v4 as uuidv4 } from 'uuid';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() displayName!: string;
  @IsString() keycloakId!: string;
  @IsString() tenantId!: string;
}

class AssignRoleDto {
  @IsIn(['OPERATOR', 'DISPATCHER', 'QUALITY_CONTROLLER', 'MAINTENANCE_TECH', 'ENGINEER', 'ADMIN', 'VIEWER'])
  role!: MesRole;

  @IsIn(['GLOBAL', 'SITE', 'AREA'])
  scopeType!: 'GLOBAL' | 'SITE' | 'AREA';

  @IsOptional() scopeId?: string | null;
  @IsString() assignedBy!: string;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new MES user' })
  async createUser(@Body() dto: CreateUserDto): Promise<{ userId: string }> {
    const userId = await this.commandBus.execute(
      new CreateUserCommand(dto.email, dto.displayName, dto.keycloakId, dto.tenantId, uuidv4()),
    );
    return { userId };
  }

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async listUsers(
    @Query('tenantId') tenantId?: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ): Promise<PaginatedUsers> {
    return this.queryBus.execute(new ListUsersQuery(tenantId, +page, +pageSize));
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUser(@Param('userId') userId: string): Promise<UserReadModel> {
    return this.queryBus.execute(new GetUserQuery(userId));
  }

  @Delete(':userId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a user' })
  async deactivateUser(@Param('userId') userId: string): Promise<void> {
    await this.commandBus.execute(new DeactivateUserCommand(userId, uuidv4()));
  }

  @Post(':userId/roles')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user' })
  async assignRole(@Param('userId') userId: string, @Body() dto: AssignRoleDto): Promise<void> {
    await this.commandBus.execute(
      new AssignRoleCommand(userId, dto.role, dto.scopeType, dto.scopeId ?? null, dto.assignedBy, uuidv4()),
    );
  }
}
