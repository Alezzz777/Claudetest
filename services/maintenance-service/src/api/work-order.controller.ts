import {
  Controller, Get, Post, Param, Body, HttpCode, HttpStatus, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsOptional, IsIn, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CreateWorkOrderCommand } from '../application/commands/create-work-order.handler';
import { StartWorkOrderCommand } from '../application/commands/start-work-order.handler';
import { CompleteWorkOrderCommand } from '../application/commands/complete-work-order.handler';
import { CancelWorkOrderCommand } from '../application/commands/cancel-work-order.handler';
import { CreateEquipmentCommand } from '../application/commands/create-equipment.handler';
import { GetEquipmentStatusQuery } from '../application/queries/get-equipment-status.handler';
import { ListEquipmentQuery } from '../application/queries/list-equipment.handler';
import { GetWorkOrderQuery } from '../application/queries/get-work-order.handler';
import { ListWorkOrdersQuery } from '../application/queries/list-work-orders.handler';
import type { WorkOrderType } from '../domain/work-order.aggregate';

class CreateEquipmentDto {
  @IsString() name!: string;
  @IsString() workCenterId!: string;
  @IsNumber() @IsPositive() maintenanceThresholdHours!: number;
  @IsString() tenantId!: string;
  @IsString() @IsOptional() correlationId?: string;
}

class CreateWorkOrderDto {
  @IsString() equipmentId!: string;
  @IsString() workOrderNo!: string;
  @IsIn(['CORRECTIVE', 'PREVENTIVE', 'PREDICTIVE']) type!: WorkOrderType;
  @IsString() description!: string;
  @IsString() createdBy!: string;
  @IsString() @IsOptional() correlationId?: string;
}

class CompleteWorkOrderDto {
  @IsString() resolution!: string;
  @IsString() completedBy!: string;
  @IsString() @IsOptional() correlationId?: string;
}

class CancelWorkOrderDto {
  @IsString() reason!: string;
  @IsString() cancelledBy!: string;
  @IsString() @IsOptional() correlationId?: string;
}

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('maintenance')
export class WorkOrderController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  // ── Equipment ─────────────────────────────────────────────────────────────

  @Post('equipment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create equipment' })
  async createEquipment(@Body() dto: CreateEquipmentDto): Promise<{ equipmentId: string }> {
    const equipmentId = await this.commandBus.execute(
      new CreateEquipmentCommand(dto.name, dto.workCenterId, dto.maintenanceThresholdHours, dto.tenantId, dto.correlationId),
    );
    return { equipmentId };
  }

  @Get('equipment')
  @ApiOperation({ summary: 'List equipment' })
  @ApiQuery({ name: 'workCenterId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async listEquipment(
    @Query('workCenterId') workCenterId?: string,
    @Query('status') status?: string,
    @Query('page') @Type(() => Number) page = 1,
    @Query('pageSize') @Type(() => Number) pageSize = 20,
  ) {
    return this.queryBus.execute(new ListEquipmentQuery(workCenterId, status, +page, +pageSize));
  }

  @Get('equipment/:equipmentId')
  @ApiOperation({ summary: 'Get equipment status' })
  async getEquipmentStatus(@Param('equipmentId') equipmentId: string) {
    return this.queryBus.execute(new GetEquipmentStatusQuery(equipmentId));
  }

  // ── Work Orders ───────────────────────────────────────────────────────────

  @Post('work-orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a work order' })
  async createWorkOrder(@Body() dto: CreateWorkOrderDto): Promise<{ workOrderId: string }> {
    const workOrderId = await this.commandBus.execute(
      new CreateWorkOrderCommand(dto.equipmentId, dto.workOrderNo, dto.type, dto.description, dto.createdBy, dto.correlationId),
    );
    return { workOrderId };
  }

  @Get('work-orders')
  @ApiOperation({ summary: 'List work orders' })
  @ApiQuery({ name: 'equipmentId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async listWorkOrders(
    @Query('equipmentId') equipmentId?: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.queryBus.execute(new ListWorkOrdersQuery(equipmentId, status, +page, +pageSize));
  }

  @Get('work-orders/:workOrderId')
  @ApiOperation({ summary: 'Get work order' })
  async getWorkOrder(@Param('workOrderId') workOrderId: string) {
    return this.queryBus.execute(new GetWorkOrderQuery(workOrderId));
  }

  @Post('work-orders/:workOrderId/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Start a work order' })
  async startWorkOrder(
    @Param('workOrderId') workOrderId: string,
    @Body('correlationId') correlationId?: string,
  ): Promise<void> {
    await this.commandBus.execute(new StartWorkOrderCommand(workOrderId, correlationId));
  }

  @Post('work-orders/:workOrderId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Complete a work order' })
  async completeWorkOrder(
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CompleteWorkOrderDto,
  ): Promise<void> {
    await this.commandBus.execute(new CompleteWorkOrderCommand(workOrderId, dto.resolution, dto.completedBy, dto.correlationId));
  }

  @Post('work-orders/:workOrderId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a work order' })
  async cancelWorkOrder(
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CancelWorkOrderDto,
  ): Promise<void> {
    await this.commandBus.execute(new CancelWorkOrderCommand(workOrderId, dto.reason, dto.cancelledBy, dto.correlationId));
  }
}
