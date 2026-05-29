import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { GetAuditLogQuery, AuditLogEntry } from '../application/queries/get-audit-log.handler';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'Paginated audit log query' })
  @ApiQuery({ name: 'aggregateId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'limit', required: false })
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
        limit ? parseInt(limit, 10) : 50,
      ),
    );
  }
}
