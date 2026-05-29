import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SchemaRegistryService } from '../infrastructure/schema-registry/schema-registry.service';

class RegisterSchemaDto {
  schema!: object;
}

@ApiTags('schemas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('schemas')
export class SchemaController {
  constructor(private readonly schemaRegistry: SchemaRegistryService) {}

  @Post(':subject')
  @ApiOperation({ summary: 'Register a new schema version' })
  async registerSchema(
    @Param('subject') subject: string,
    @Body() dto: RegisterSchemaDto,
  ): Promise<{ id: number }> {
    const id = await this.schemaRegistry.registerSchema(subject, dto.schema);
    return { id };
  }

  @Get(':subject/latest')
  @ApiOperation({ summary: 'Get latest schema for a subject' })
  async getLatest(
    @Param('subject') subject: string,
  ): Promise<{ version: number; schema: object } | null> {
    return this.schemaRegistry.getLatestSchema(subject);
  }

  @Post(':subject/check-compatibility')
  @ApiOperation({ summary: 'Check schema compatibility against latest version' })
  async checkCompatibility(
    @Param('subject') subject: string,
    @Body() dto: RegisterSchemaDto,
  ): Promise<{ isCompatible: boolean }> {
    const isCompatible = await this.schemaRegistry.checkCompatibility(subject, dto.schema);
    return { isCompatible };
  }
}
