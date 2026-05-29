import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetAuditLogQuery, AuditLogEntry } from '../application/queries/get-audit-log.handler';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'Query audit log' })
  @ApiQuery({ name: 'aggregateId', required: false })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAuditLog(
    @Query('aggregateId') aggregateId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditLogEntry[]> {
    return this.queryBus.execute(
      new GetAuditLogQuery(
        aggregateId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        limit ? +limit : 50,
      ),
    );
  }
}
