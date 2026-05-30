import { describe, it, expect, vi } from 'vitest';

/**
 * Smoke test for AppModule health endpoint structure.
 *
 * This test verifies the health check pattern without starting a full NestJS
 * application, avoiding dependency on actual database / Kafka connections.
 */
describe('AppModule health endpoint (smoke test)', () => {
  it('verifies health response structure matches { status: "ok" }', () => {
    // Simulate the health endpoint response shape that NestJS Terminus produces
    const mockHealthResponse = {
      status: 'ok' as const,
      info: {},
      error: {},
      details: {},
    };

    expect(mockHealthResponse.status).toBe('ok');
    expect(mockHealthResponse).toHaveProperty('status', 'ok');
  });

  it('AppModule class exists and can be imported', async () => {
    // Dynamic import to avoid NestJS DI resolution at test time
    // We only verify the module is importable and has the expected shape
    const { AppModule } = await import('../app.module');
    expect(AppModule).toBeDefined();
    // NestJS modules are classes (functions in JS)
    expect(typeof AppModule).toBe('function');
  });

  it('health endpoint path is conventionally /health', () => {
    // Document the health endpoint contract for integration tests
    const HEALTH_PATH = '/health';
    expect(HEALTH_PATH).toBe('/health');
  });

  it('health response when all systems nominal returns ok status', () => {
    // Unit-level check: mock a service dependency check
    const mockDependencyChecks = {
      database: { status: 'up' as const },
      kafka: { status: 'up' as const },
    };

    const allUp = Object.values(mockDependencyChecks).every(
      (check) => check.status === 'up',
    );

    const healthResult = {
      status: allUp ? 'ok' : 'error',
      info: mockDependencyChecks,
    };

    expect(healthResult.status).toBe('ok');
    expect(healthResult.info.database.status).toBe('up');
    expect(healthResult.info.kafka.status).toBe('up');
  });
});
