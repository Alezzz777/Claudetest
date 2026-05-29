import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
} from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { StartProductionOrderCommand } from '../application/commands/start-production-order.handler';
import {
  GetProductionOrderQuery,
  ProductionOrderReadModel,
} from '../application/queries/get-production-order.handler';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class StartOrderDto {
  @IsString()
  @IsNotEmpty()
  operatorId!: string;

  @IsUUID()
  @IsNotEmpty()
  correlationId!: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('production-orders')
@ApiBearerAuth()
@Controller('production-orders')
export class ProductionOrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':orderId')
  @ApiOperation({ summary: 'Get production order by ID (read from projection)' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Production order found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getOrder(
    @Param('orderId') orderId: string,
  ): Promise<ProductionOrderReadModel> {
    return this.queryBus.execute(new GetProductionOrderQuery(orderId));
  }

  @Post(':orderId/start')
  @HttpCode(HttpStatus.NO_CONTENT)
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
}
