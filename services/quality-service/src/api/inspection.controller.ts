import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsUUID } from 'class-validator';
import { RecordMeasurementCommand } from '../application/commands/record-measurement.handler';
import { GetInspectionResultsQuery, InspectionSummary } from '../application/queries/get-inspection-results.handler';

class RecordMeasurementDto {
  @IsString() characteristicId!: string;
  @IsString() characteristicName!: string;
  @IsNumber() nominalValue!: number;
  @IsNumber() lowerLimit!: number;
  @IsNumber() upperLimit!: number;
  @IsNumber() actualValue!: number;
  @IsString() uom!: string;
  @IsString() operatorId!: string;
  @IsUUID() correlationId!: string;
}

@ApiTags('inspections')
@ApiBearerAuth()
@Controller('quality-plans')
export class InspectionController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Get(':orderId/results')
  @ApiOperation({ summary: 'Get inspection summary for a production order' })
  async getResults(@Param('orderId') orderId: string): Promise<InspectionSummary> {
    return this.queryBus.execute(new GetInspectionResultsQuery(orderId));
  }

  @Post(':planId/measurements')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record a quality measurement' })
  async record(@Param('planId') planId: string, @Body() dto: RecordMeasurementDto): Promise<void> {
    await this.commandBus.execute(
      new RecordMeasurementCommand(planId, dto.characteristicId, dto.characteristicName,
        dto.nominalValue, dto.lowerLimit, dto.upperLimit, dto.actualValue, dto.uom,
        dto.operatorId, dto.correlationId),
    );
  }
}
