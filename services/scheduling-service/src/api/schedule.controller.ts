import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsDateString, IsUUID } from 'class-validator';
import { InsertScheduleOrderCommand } from '../application/commands/insert-schedule-order.handler';
import { GetScheduleQuery, ScheduleReadModel } from '../application/queries/get-schedule.handler';

class InsertOrderDto {
  @IsUUID() orderId!: string;
  @IsString() workCenterId!: string;
  @IsNumber() priority!: number;
  @IsDateString() plannedStartAt!: string;
  @IsDateString() plannedEndAt!: string;
  @IsString() insertedBy!: string;
  @IsUUID() correlationId!: string;
}

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('schedules')
export class ScheduleController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Get(':scheduleId')
  @ApiOperation({ summary: 'Get schedule with all entries' })
  async getSchedule(@Param('scheduleId') scheduleId: string): Promise<ScheduleReadModel> {
    return this.queryBus.execute(new GetScheduleQuery(scheduleId));
  }

  @Post(':scheduleId/orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Insert an order into the schedule' })
  async insertOrder(@Param('scheduleId') scheduleId: string, @Body() dto: InsertOrderDto): Promise<{ entryId: string }> {
    const entryId = await this.commandBus.execute(
      new InsertScheduleOrderCommand(scheduleId, dto.orderId, dto.workCenterId, dto.priority, new Date(dto.plannedStartAt), new Date(dto.plannedEndAt), dto.insertedBy, dto.correlationId)
    );
    return { entryId };
  }
}
