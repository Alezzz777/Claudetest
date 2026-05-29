import { Module } from '@nestjs/common';
import { SchemaRegistryService } from './schema-registry.service';

@Module({
  providers: [SchemaRegistryService],
  exports: [SchemaRegistryService],
})
export class SchemaRegistryModule {}
