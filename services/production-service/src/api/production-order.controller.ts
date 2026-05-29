import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard, Roles } from './guards/roles.guard';

import { StartProductionOrderCommand } from '../application/commands/start-production-order.handler';
import { CreateProductionOrderCommand } from '../application/commands/create-production-order.handler';
import { ReleaseProductionOrderCommand } from '../application/commands/release-production-order.handler';
import { CompleteProductionOrderCommand } from '../application/commands/complete-production-order.handler';
import { CancelProductionOrderCommand } from '../application/commands/cancel-production-order.handler';
import { CompleteOperationCommand } from '../application/commands/complete-operation.handler';

import {
  GetProductionOrderQuery,
  ProductionOrderReadModel,
} from '../application/queries/get-production-order.handler';
import {
  ListProductionOrdersQuery,
  PaginatedOrders,
} from '../application/queries/list-production-orders.handler';
import { GetOeeQuery, OeeReadModel } from '../application/queries/get-oee.handler';
import { GetGenealogyQuery, GenealogyNodeReadModel } from '../application/queries/get-genealogy.handler';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateOrderDto {
  @IsString() @IsNotEmpty() orderNo!: string;
  @IsString() @IsNotEmpty() recipeId!: string;
  @IsString() @IsNotEmpty() recipeVersion!: string;
  @IsNumber() @IsPositive() plannedQty!: number;
  @IsString() @IsNotEmpty() uom!: string;
  @IsDateString() scheduledStartAt!: string;
  @IsDateString() scheduledEndAt!: string;
  @IsString() @IsNotEmpty() workCenterId!: string;
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsUUID() @IsNotEmpty() correlationId!: string;
}

class StartOrderDto {
  @IsString() @IsNotEmpty() operatorId!: string;
  @IsUUID() @IsNotEmpty() correlationId!: string;
}

class ReleaseOrderDto {
  @IsString() @IsNotEmpty() releasedBy!: string;
  @IsUUID() @IsNotEmpty() correlationId!: string;
}

class CompleteOrderDto {
  @IsString() @IsNotEmpty() completedBy!: string;
  @IsUUID() @IsNotEmpty() correlationId!: string;
}

class CancelOrderDto {
  @IsString() @IsNotEmpty() reason!: string;
  @IsString() @IsNotEmpty() cancelledBy!: string;
  @IsUUID() @IsNotEmpty() correlationId!: string;
}

class CompleteOperationDto {
  @IsNumber() @Min(0) completedQty!: number;
  @IsNumber() @Min(0) scrapQty!: number;
  @IsString() @IsNotEmpty() operatorId!: string;
  @IsUUID() @IsNotEmpty() correlationId!: string;
  @IsNumber() @IsPositive() operationNo!: number;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('production-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProductionOrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── Production Orders ──────────────────────────────────────────────────────

  @Post('production-orders')
  @Roles('DISPATCHER', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new production order' })
  @ApiResponse({ status: 201, description: 'Order created' })
  async createOrder(@Body() dto: CreateOrderDto): Promise<{ orderId: string }> {
    const orderId = await this.commandBus.execute(
      new CreateProductionOrderCommand(
        dto.orderNo,
        dto.recipeId,
        dto.recipeVersion,
        dto.plannedQty,
        dto.uom,
        new Date(dto.scheduledStartAt),
        new Date(dto.scheduledEndAt),
        dto.workCenterId,
        dto.tenantId,
        dto.correlationId,
      ),
    );
    return { orderId };
  }

  @Get('production-orders')
  @Roles('VIEWER', 'OPERATOR', 'DISPATCHER')
  @ApiOperation({ summary: 'List production orders with optional filters' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'workCenterId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  async listOrders(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('workCenterId') workCenterId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedOrders> {
    return this.queryBus.execute(
      new ListProductionOrdersQuery(
        tenantId,
        status,
        workCenterId,
        page ? parseInt(page, 10) : 1,
        pageSize ? parseInt(pageSize, 10) : 20,
      ),
    );
  }

  @Get('production-orders/:orderId')
  @Roles('VIEWER', 'OPERATOR', 'DISPATCHER')
  @ApiOperation({ summary: 'Get production order by ID (read from projection)' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Production order found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getOrder(@Param('orderId') orderId: string): Promise<ProductionOrderReadModel> {
    return this.queryBus.execute(new GetProductionOrderQuery(orderId));
  }

  @Post('production-orders/:orderId/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DISPATCHER')
  @ApiOperation({ summary: 'Release a draft production order' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Order released' })
  async releaseOrder(
    @Param('orderId') orderId: string,
    @Body() dto: ReleaseOrderDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new ReleaseProductionOrderCommand(orderId, dto.releasedBy, dto.correlationId),
    );
  }

  @Post('production-orders/:orderId/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DISPATCHER', 'OPERATOR')
  @ApiOperation({ summary: 'Start a released production order' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Order started' })
  @ApiResponse({ status: 409, description: 'Concurrency conflict or invalid state' })
  async startOrder(
    @Param('orderId') orderId: string,
    @Body() dto: StartOrderDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new StartProductionOrderCommand(orderId, dto.operatorId, dto.correlationId),
    );
  }

  @Post('production-orders/:orderId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DISPATCHER', 'OPERATOR')
  @ApiOperation({ summary: 'Complete an in-progress production order' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Order completed' })
  async completeOrder(
    @Param('orderId') orderId: string,
    @Body() dto: CompleteOrderDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new CompleteProductionOrderCommand(orderId, dto.completedBy, dto.correlationId),
    );
  }

  @Post('production-orders/:orderId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DISPATCHER')
  @ApiOperation({ summary: 'Cancel a production order' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Order cancelled' })
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new CancelProductionOrderCommand(orderId, dto.reason, dto.cancelledBy, dto.correlationId),
    );
  }

  @Post('production-orders/:orderId/operations/:operationId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OPERATOR')
  @ApiOperation({ summary: 'Complete an operation within a production order' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'operationId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Operation completed' })
  async completeOperation(
    @Param('orderId') orderId: string,
    @Param('operationId') operationId: string,
    @Body() dto: CompleteOperationDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new CompleteOperationCommand(
        orderId,
        operationId,
        dto.operationNo,
        dto.completedQty,
        dto.scrapQty,
        dto.operatorId,
        dto.correlationId,
      ),
    );
  }

  @Get('production-orders/:orderId/genealogy')
  @Roles('VIEWER', 'OPERATOR', 'DISPATCHER')
  @ApiOperation({ summary: 'Get genealogy tree for a production order' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Genealogy nodes' })
  async getGenealogy(
    @Param('orderId') orderId: string,
  ): Promise<GenealogyNodeReadModel[]> {
    return this.queryBus.execute(new GetGenealogyQuery(orderId));
  }

  // ── Equipment / OEE ────────────────────────────────────────────────────────

  @Get('equipment/:workCenterId/oee')
  @Roles('VIEWER', 'OPERATOR', 'DISPATCHER')
  @ApiOperation({ summary: 'Get averaged OEE metrics for a work center' })
  @ApiParam({ name: 'workCenterId', type: 'string' })
  @ApiQuery({ name: 'from', required: true, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: true, description: 'ISO date string' })
  @ApiResponse({ status: 200, description: 'OEE metrics' })
  async getOee(
    @Param('workCenterId') workCenterId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<OeeReadModel> {
    return this.queryBus.execute(new GetOeeQuery(workCenterId, new Date(from), new Date(to)));
  }
}
