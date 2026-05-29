import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsDateString, IsIn } from 'class-validator';
import { CreateWorkOrderCommand } from '../application/commands/create-work-order.handler';
import { GetEquipmentStatusQuery, EquipmentStatusReadModel } from '../application/queries/get-equipment-status.handler';
import type { WorkOrderType } from '../domain/equipment.aggregate';

class CreateWorkOrderDto {
  @IsIn(['CORRECTIVE', 'PREVENTIVE', 'PREDICTIVE']) workOrderType!: WorkOrderType;
  @IsString() description!: string;
  @IsNumber() priority!: number;
  @IsDateString() plannedStartAt!: string;
  @IsString() createdBy!: string;
  @IsString() correlationId!: string;
}

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller('equipment')
export class WorkOrderController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Get(':equipmentId/status')
  @ApiOperation({ summary: 'Get equipment status and runtime metrics' })
  async getStatus(@Param('equipmentId') equipmentId: string): Promise<EquipmentStatusReadModel> {
    return this.queryBus.execute(new GetEquipmentStatusQuery(equipmentId));
  }

  @Post(':equipmentId/work-orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a maintenance work order' })
  async createWorkOrder(@Param('equipmentId') equipmentId: string, @Body() dto: CreateWorkOrderDto): Promise<{ workOrderId: string }> {
    const workOrderId = await this.commandBus.execute(
      new CreateWorkOrderCommand(equipmentId, dto.workOrderType, dto.description, dto.priority, new Date(dto.plannedStartAt), dto.createdBy, dto.correlationId)
    );
    return { workOrderId };
  }
}
