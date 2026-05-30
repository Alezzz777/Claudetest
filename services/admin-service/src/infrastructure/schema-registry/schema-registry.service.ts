import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SchemaRegistryService {
  private readonly logger = new Logger(SchemaRegistryService.name);
  private readonly baseUrl = process.env['SCHEMA_REGISTRY_URL'] ?? 'http://schema-registry:8081';

  async registerSchema(subject: string, schema: object): Promise<number> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
      body: JSON.stringify({ schema: JSON.stringify(schema) }),
    });
    if (!res.ok) {
      throw new Error(`Schema Registry registerSchema error: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { id: number };
    this.logger.log(`Registered schema for subject ${subject}, id=${data.id}`);
    return data.id;
  }

  async checkCompatibility(subject: string, schema: object): Promise<boolean> {
    const url = `${this.baseUrl}/compatibility/subjects/${encodeURIComponent(subject)}/versions/latest`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
        body: JSON.stringify({ schema: JSON.stringify(schema) }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { is_compatible: boolean };
      return data.is_compatible;
    } catch {
      return false;
    }
  }

  async getLatestSchema(subject: string): Promise<{ version: number; schema: object } | null> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions/latest`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Schema Registry getLatest error: ${res.status}`);
    const data = (await res.json()) as { version: number; schema: string };
    return { version: data.version, schema: JSON.parse(data.schema) };
  }
}
