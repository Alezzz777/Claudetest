import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { ErpB2mmlAdapterService } from '../adapters/erp-b2mml/erp-b2mml-adapter.service';
import { GetDeviceStatusQuery, DeviceStatusReadModel } from '../application/queries/get-device-status.handler';

@ApiTags('integration')
@ApiBearerAuth()
@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly b2mmlAdapter: ErpB2mmlAdapterService,
  ) {}

  @Get('devices/:deviceId/status')
  @ApiOperation({ summary: 'Get device connectivity status' })
  async getDeviceStatus(@Param('deviceId') deviceId: string): Promise<DeviceStatusReadModel> {
    return this.queryBus.execute(new GetDeviceStatusQuery(deviceId));
  }

  @Post('erp/b2mml/production-schedule')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Receive B2MML ProductionSchedule from ERP' })
  async receiveProductionSchedule(@Body() body: { xml: string }): Promise<{ ordersReceived: number }> {
    return this.b2mmlAdapter.processProductionSchedule(body.xml);
  }
}
