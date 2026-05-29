import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ErpB2mmlAdapterService } from '../adapters/erp-b2mml/erp-b2mml-adapter.service';
import { EdgeModeService } from '../infrastructure/edge/edge-mode.service';
import { GetDeviceStatusQuery, DeviceStatusReadModel } from '../application/queries/get-device-status.handler';
import { ListDevicesQuery, PaginatedDevices } from '../application/queries/list-devices.handler';
import { GetEdgeBufferStatusQuery, EdgeBufferStatus } from '../application/queries/get-edge-buffer-status.handler';
import { RegisterDeviceCommand } from '../application/commands/register-device.handler';

@ApiTags('integration')
@ApiBearerAuth()
@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly b2mmlAdapter: ErpB2mmlAdapterService,
    private readonly edgeMode: EdgeModeService,
  ) {}

  // ─── ERP ────────────────────────────────────────────────────────────────────

  @Post('erp/schedule')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Receive B2MML ProductionSchedule XML from ERP' })
  async receiveSchedule(@Body() body: string): Promise<string> {
    return this.b2mmlAdapter.processIncomingSchedule(body);
  }

  @Get('erp/performance')
  @ApiOperation({ summary: 'Get B2MML ProductionPerformance XML (stub)' })
  getPerformance(): string {
    return this.b2mmlAdapter.buildPerformanceReport([]);
  }

  // ─── Devices ─────────────────────────────────────────────────────────────────

  @Get('devices')
  @ApiOperation({ summary: 'List all devices' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'protocol', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async listDevices(
    @Query('status') status?: string,
    @Query('protocol') protocol?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedDevices> {
    return this.queryBus.execute(
      new ListDevicesQuery(
        status,
        protocol,
        page ? parseInt(page, 10) : 1,
        pageSize ? parseInt(pageSize, 10) : 20,
      ),
    );
  }

  @Get('devices/:deviceId')
  @ApiOperation({ summary: 'Get device status' })
  async getDevice(@Param('deviceId') deviceId: string): Promise<DeviceStatusReadModel> {
    return this.queryBus.execute(new GetDeviceStatusQuery(deviceId));
  }

  @Post('devices/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a device' })
  async registerDevice(
    @Body() body: { deviceId: string; protocol: string; unsPath: string; correlationId?: string },
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(
      new RegisterDeviceCommand(body.deviceId, body.protocol, body.unsPath, body.correlationId),
    );
    return { success: true };
  }

  // ─── Edge ────────────────────────────────────────────────────────────────────

  @Get('edge/status')
  @ApiOperation({ summary: 'Get edge buffer status' })
  async getEdgeStatus(): Promise<EdgeBufferStatus> {
    return this.queryBus.execute(new GetEdgeBufferStatusQuery());
  }

  @Post('edge/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Manually trigger edge buffer replay' })
  async replayEdgeBuffer(): Promise<{ triggered: boolean }> {
    await this.edgeMode.replayBuffer();
    return { triggered: true };
  }
}
