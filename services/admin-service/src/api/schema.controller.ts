import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchemaRegistryService } from '../infrastructure/schema-registry/schema-registry.service';

class RegisterSchemaDto {
  schema!: object;
}

@ApiTags('admin-schemas')
@ApiBearerAuth()
@Controller('schemas')
export class SchemaController {
  constructor(private readonly schemaRegistry: SchemaRegistryService) {}

  @Post(':subject')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a schema for a subject' })
  async registerSchema(
    @Param('subject') subject: string,
    @Body() dto: RegisterSchemaDto,
  ): Promise<{ id: number }> {
    const id = await this.schemaRegistry.registerSchema(subject, dto.schema);
    return { id };
  }

  @Get(':subject/latest')
  @ApiOperation({ summary: 'Get the latest schema for a subject' })
  async getLatestSchema(
    @Param('subject') subject: string,
  ): Promise<{ version: number; schema: object } | null> {
    return this.schemaRegistry.getLatestSchema(subject);
  }

  @Post(':subject/check-compatibility')
  @ApiOperation({ summary: 'Check schema compatibility against latest version' })
  async checkCompatibility(
    @Param('subject') subject: string,
    @Body() dto: RegisterSchemaDto,
  ): Promise<{ is_compatible: boolean }> {
    const compatible = await this.schemaRegistry.checkCompatibility(subject, dto.schema);
    return { is_compatible: compatible };
  }
}
