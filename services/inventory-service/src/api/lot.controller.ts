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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsUUID, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { CreateLotCommand } from '../application/commands/create-lot.handler';
import { MoveLotCommand } from '../application/commands/move-lot.handler';
import { ReserveLotCommand } from '../application/commands/reserve-lot.handler';
import { ReleaseLotCommand } from '../application/commands/release-lot.handler';
import { ConsumeLotCommand } from '../application/commands/consume-lot.handler';
import { GetLotStatusQuery, LotReadModel } from '../application/queries/get-lot-status.handler';
import { ListLotsQuery, PaginatedLots } from '../application/queries/list-lots.handler';
import { GetWipQuery, WipReadModel } from '../application/queries/get-wip.handler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

class CreateLotDto {
  @IsString() lotNo!: string;
  @IsString() materialCode!: string;
  @IsNumber() @Type(() => Number) quantity!: number;
  @IsString() locationId!: string;
  @IsString() tenantId!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class MoveLotDto {
  @IsString() toLocationId!: string;
  @IsString() movedBy!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class ReserveLotDto {
  @IsString() orderId!: string;
  @IsNumber() @Type(() => Number) qty!: number;
  @IsOptional() @IsUUID() correlationId?: string;
}

class ReleaseLotDto {
  @IsString() orderId!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class ConsumeLotDto {
  @IsString() orderId!: string;
  @IsNumber() @Type(() => Number) qty!: number;
  @IsString() consumedBy!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class ListLotsQueryDto {
  @IsOptional() @IsString() materialCode?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number;
}

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class LotController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('lots')
  @ApiOperation({ summary: 'Create a new material lot' })
  async createLot(@Body() dto: CreateLotDto): Promise<{ lotId: string }> {
    const lotId = await this.commandBus.execute<CreateLotCommand, string>(
      new CreateLotCommand(dto.lotNo, dto.materialCode, dto.quantity, dto.locationId, dto.tenantId, dto.correlationId),
    );
    return { lotId };
  }

  @Get('lots')
  @ApiOperation({ summary: 'List lots with optional filters' })
  async listLots(@Query() q: ListLotsQueryDto): Promise<PaginatedLots> {
    return this.queryBus.execute(new ListLotsQuery(q.materialCode, q.status, q.locationId, q.page, q.pageSize));
  }

  @Get('lots/:lotId')
  @ApiOperation({ summary: 'Get lot status and location' })
  async getLot(@Param('lotId') lotId: string): Promise<LotReadModel> {
    return this.queryBus.execute(new GetLotStatusQuery(lotId));
  }

  @Post('lots/:lotId/reserve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reserve a lot for a production order' })
  async reserveLot(@Param('lotId') lotId: string, @Body() dto: ReserveLotDto): Promise<void> {
    await this.commandBus.execute(new ReserveLotCommand(lotId, dto.orderId, dto.qty, dto.correlationId));
  }

  @Post('lots/:lotId/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Release a lot reservation' })
  async releaseLot(@Param('lotId') lotId: string, @Body() dto: ReleaseLotDto): Promise<void> {
    await this.commandBus.execute(new ReleaseLotCommand(lotId, dto.orderId, dto.correlationId));
  }

  @Post('lots/:lotId/move')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Move a lot to a new location' })
  async moveLot(@Param('lotId') lotId: string, @Body() dto: MoveLotDto): Promise<void> {
    await this.commandBus.execute(new MoveLotCommand(lotId, dto.toLocationId, dto.movedBy, dto.correlationId));
  }

  @Post('lots/:lotId/consume')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Consume quantity from a lot' })
  async consumeLot(@Param('lotId') lotId: string, @Body() dto: ConsumeLotDto): Promise<void> {
    await this.commandBus.execute(new ConsumeLotCommand(lotId, dto.orderId, dto.qty, dto.consumedBy, dto.correlationId));
  }

  @Get('wip/:orderId')
  @ApiOperation({ summary: 'Get WIP for a production order' })
  async getWip(@Param('orderId') orderId: string): Promise<WipReadModel | null> {
    return this.queryBus.execute(new GetWipQuery(orderId));
  }
}
