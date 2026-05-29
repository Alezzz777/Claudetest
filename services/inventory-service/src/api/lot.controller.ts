import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsUUID } from 'class-validator';
import { MoveLotCommand } from '../application/commands/move-lot.handler';
import { GetLotStatusQuery, LotReadModel } from '../application/queries/get-lot-status.handler';

class MoveLotDto {
  @IsString() toLocationId!: string;
  @IsNumber() quantity!: number;
  @IsString() movedBy!: string;
  @IsString() reason!: string;
  @IsUUID() correlationId!: string;
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('lots')
export class LotController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Get(':lotId')
  @ApiOperation({ summary: 'Get lot status and location' })
  async getLot(@Param('lotId') lotId: string): Promise<LotReadModel> {
    return this.queryBus.execute(new GetLotStatusQuery(lotId));
  }

  @Post(':lotId/move')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Move a lot to a new location' })
  async moveLot(@Param('lotId') lotId: string, @Body() dto: MoveLotDto): Promise<void> {
    await this.commandBus.execute(new MoveLotCommand(lotId, dto.toLocationId, dto.quantity, dto.movedBy, dto.reason, dto.correlationId));
  }
}
