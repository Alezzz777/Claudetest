import {
  Controller, Get, Post, Param, Body, Query,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsArray, ValidateNested, IsOptional, IsUUID, Min, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CreateQualityPlanCommand } from '../application/commands/create-quality-plan.handler';
import { ActivateQualityPlanCommand } from '../application/commands/activate-quality-plan.handler';
import { RecordMeasurementCommand, RecordMeasurementResult } from '../application/commands/record-measurement.handler';
import { CloseNonConformanceCommand } from '../application/commands/close-nonconformance.handler';
import { GetInspectionResultsQuery, MeasurementResult } from '../application/queries/get-inspection-results.handler';
import { ListNonConformancesQuery, PaginatedNonConformances } from '../application/queries/list-nonconformances.handler';
import { MeasurementSpec } from '../domain/quality-plan.aggregate';

class MeasurementSpecDto implements MeasurementSpec {
  @IsString() parameterId!: string;
  @IsString() name!: string;
  @IsNumber() lsl!: number;
  @IsNumber() usl!: number;
  @IsString() uom!: string;
}

class CreateQualityPlanDto {
  @IsString() productCode!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasurementSpecDto)
  specs!: MeasurementSpecDto[];
  @IsString() createdBy!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class RecordMeasurementDto {
  @IsString() orderId!: string;
  @IsString() operationId!: string;
  @IsString() planId!: string;
  @IsString() parameterId!: string;
  @IsNumber() value!: number;
  @IsString() recordedBy!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class CloseNonConformanceDto {
  @IsString() closedBy!: string;
  @IsString() resolution!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

@ApiTags('quality')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quality')
export class InspectionController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a quality plan for a product' })
  async createPlan(@Body() dto: CreateQualityPlanDto): Promise<{ planId: string }> {
    const planId = await this.commandBus.execute<CreateQualityPlanCommand, string>(
      new CreateQualityPlanCommand(dto.productCode, dto.specs, dto.createdBy, dto.correlationId),
    );
    return { planId };
  }

  @Post('plans/:planId/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Activate a quality plan' })
  async activatePlan(
    @Param('planId') planId: string,
    @Body('correlationId') correlationId?: string,
  ): Promise<void> {
    await this.commandBus.execute(new ActivateQualityPlanCommand(planId, correlationId));
  }

  @Post('measurements')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a quality measurement' })
  async recordMeasurement(@Body() dto: RecordMeasurementDto): Promise<RecordMeasurementResult> {
    return this.commandBus.execute<RecordMeasurementCommand, RecordMeasurementResult>(
      new RecordMeasurementCommand(
        dto.orderId,
        dto.operationId,
        dto.planId,
        dto.parameterId,
        dto.value,
        dto.recordedBy,
        dto.correlationId,
      ),
    );
  }

  @Get('orders/:orderId/measurements')
  @ApiOperation({ summary: 'Get measurements for a production order' })
  async getMeasurements(@Param('orderId') orderId: string): Promise<MeasurementResult[]> {
    return this.queryBus.execute(new GetInspectionResultsQuery(orderId));
  }

  @Get('nonconformances')
  @ApiQuery({ name: 'orderId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOperation({ summary: 'List non-conformances with optional filters' })
  async listNonConformances(
    @Query('orderId') orderId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedNonConformances> {
    return this.queryBus.execute(
      new ListNonConformancesQuery(
        orderId,
        status,
        page ? parseInt(page, 10) : 1,
        pageSize ? parseInt(pageSize, 10) : 20,
      ),
    );
  }

  @Post('nonconformances/:ncId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close a non-conformance' })
  async closeNonConformance(
    @Param('ncId') ncId: string,
    @Body() dto: CloseNonConformanceDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new CloseNonConformanceCommand(ncId, dto.closedBy, dto.resolution, dto.correlationId),
    );
  }
}
