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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsNumber, IsDateString, IsUUID, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { InsertScheduleOrderCommand } from '../application/commands/insert-schedule-order.handler';
import { CreateScheduleCommand } from '../application/commands/create-schedule.handler';
import { PublishScheduleCommand } from '../application/commands/publish-schedule.handler';
import { RescheduleEntryCommand } from '../application/commands/reschedule-entry.handler';
import { CancelScheduleEntryCommand } from '../application/commands/cancel-schedule-entry.handler';
import { GetScheduleQuery, ScheduleReadModel } from '../application/queries/get-schedule.handler';
import { ListSchedulesQuery, PaginatedSchedules } from '../application/queries/list-schedules.handler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

class CreateScheduleDto {
  @IsString() name!: string;
  @IsDateString() shiftDate!: string;
  @IsString() createdBy!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class InsertOrderDto {
  @IsUUID() orderId!: string;
  @IsString() workCenterId!: string;
  @IsNumber() @Type(() => Number) priority!: number;
  @IsDateString() plannedStartAt!: string;
  @IsDateString() plannedEndAt!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class PublishScheduleDto {
  @IsString() publishedBy!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class RescheduleEntryDto {
  @IsDateString() newStartAt!: string;
  @IsDateString() newEndAt!: string;
  @IsString() reason!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

class CancelEntryDto {
  @IsString() reason!: string;
  @IsOptional() @IsUUID() correlationId?: string;
}

@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schedules')
export class ScheduleController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new production schedule' })
  async createSchedule(@Body() dto: CreateScheduleDto): Promise<{ scheduleId: string }> {
    const scheduleId = await this.commandBus.execute(
      new CreateScheduleCommand(dto.name, new Date(dto.shiftDate), dto.createdBy, dto.correlationId),
    );
    return { scheduleId };
  }

  @Get()
  @ApiOperation({ summary: 'List schedules with optional filters' })
  @ApiQuery({ name: 'shiftDate', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async listSchedules(
    @Query('shiftDate') shiftDate?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedSchedules> {
    return this.queryBus.execute(
      new ListSchedulesQuery(
        shiftDate ? new Date(shiftDate) : undefined,
        status,
        page ? parseInt(page, 10) : 1,
        pageSize ? parseInt(pageSize, 10) : 20,
      ),
    );
  }

  @Get(':scheduleId')
  @ApiOperation({ summary: 'Get schedule with all entries' })
  async getSchedule(@Param('scheduleId') scheduleId: string): Promise<ScheduleReadModel> {
    return this.queryBus.execute(new GetScheduleQuery(scheduleId));
  }

  @Post(':scheduleId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a schedule' })
  async publishSchedule(
    @Param('scheduleId') scheduleId: string,
    @Body() dto: PublishScheduleDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new PublishScheduleCommand(scheduleId, dto.publishedBy, dto.correlationId),
    );
  }

  @Post(':scheduleId/orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Insert an order into the schedule' })
  async insertOrder(
    @Param('scheduleId') scheduleId: string,
    @Body() dto: InsertOrderDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new InsertScheduleOrderCommand(
        scheduleId,
        dto.orderId,
        dto.workCenterId,
        dto.priority,
        new Date(dto.plannedStartAt),
        new Date(dto.plannedEndAt),
        dto.correlationId,
      ),
    );
  }

  @Post(':scheduleId/entries/:entryId/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reschedule an entry' })
  async rescheduleEntry(
    @Param('scheduleId') scheduleId: string,
    @Param('entryId') entryId: string,
    @Body() dto: RescheduleEntryDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new RescheduleEntryCommand(
        scheduleId,
        entryId,
        new Date(dto.newStartAt),
        new Date(dto.newEndAt),
        dto.reason,
        dto.correlationId,
      ),
    );
  }

  @Post(':scheduleId/entries/:entryId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a schedule entry' })
  async cancelEntry(
    @Param('scheduleId') scheduleId: string,
    @Param('entryId') entryId: string,
    @Body() dto: CancelEntryDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new CancelScheduleEntryCommand(scheduleId, entryId, dto.reason, dto.correlationId),
    );
  }
}
