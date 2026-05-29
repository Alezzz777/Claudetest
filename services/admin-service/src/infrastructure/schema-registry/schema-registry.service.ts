import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SchemaRegistryService {
  private readonly logger = new Logger(SchemaRegistryService.name);
  private readonly baseUrl = process.env['SCHEMA_REGISTRY_URL'] ?? 'http://schema-registry:8081';

  /**
   * Register a schema under a subject. Returns the schema ID.
   */
  async registerSchema(subject: string, schema: object): Promise<number> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
      body: JSON.stringify({ schema: JSON.stringify(schema) }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Schema Registry registerSchema failed (${res.status}): ${text}`);
    }

    const json = await res.json() as { id: number };
    this.logger.log(`Schema registered for subject "${subject}", id=${json.id}`);
    return json.id;
  }

  /**
   * Check if a schema is compatible with the latest version for a subject.
   */
  async checkCompatibility(subject: string, schema: object): Promise<boolean> {
    const url = `${this.baseUrl}/compatibility/subjects/${encodeURIComponent(subject)}/versions/latest`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
      body: JSON.stringify({ schema: JSON.stringify(schema) }),
    });

    if (!res.ok) {
      // 404 means no previous version — treat as compatible
      if (res.status === 404) return true;
      const text = await res.text();
      throw new Error(`Schema Registry checkCompatibility failed (${res.status}): ${text}`);
    }

    const json = await res.json() as { is_compatible: boolean };
    return json.is_compatible;
  }

  /**
   * Get the latest schema version for a subject. Returns null if subject not found.
   */
  async getLatestSchema(subject: string): Promise<{ version: number; schema: object } | null> {
    const url = `${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions/latest`;
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.schemaregistry.v1+json' },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Schema Registry getLatestSchema failed (${res.status}): ${text}`);
    }

    const json = await res.json() as { version: number; schema: string };
    return { version: json.version, schema: JSON.parse(json.schema) as object };
  }
}
