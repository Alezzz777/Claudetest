import { describe, it, expect } from 'vitest';
import { Client } from 'pg';

const SKIP = process.env['SKIP_INFRA_TESTS'] === 'true';

/** Port → service mapping matching docker-compose.yml */
const PG_INSTANCES: { port: number; service: string; database: string }[] = [
  { port: 5432, service: 'production-service',   database: 'production_db' },
  { port: 5433, service: 'quality-service',       database: 'quality_db' },
  { port: 5434, service: 'maintenance-service',   database: 'maintenance_db' },
  { port: 5435, service: 'inventory-service',     database: 'inventory_db' },
  { port: 5436, service: 'recipe-service',        database: 'recipe_db' },
  { port: 5437, service: 'scheduling-service',    database: 'scheduling_db' },
  { port: 5438, service: 'integration-service',   database: 'integration_db' },
  { port: 5439, service: 'admin-service',         database: 'admin_db' },
];

describe.skipIf(SKIP)('PostgreSQL connectivity', () => {
  for (const { port, service, database } of PG_INSTANCES) {
    it(`connects to ${service} on port ${port} and executes SELECT 1`, async () => {
      const client = new Client({
        host: 'localhost',
        port,
        user: 'mes',
        password: 'mes_secret',
        database,
        connectionTimeoutMillis: 5000,
      });

      try {
        await client.connect();
        const res = await client.query<{ result: number }>('SELECT 1 as result');
        expect(res.rows[0]?.result).toBe(1);
      } finally {
        await client.end();
      }
    });
  }
});
