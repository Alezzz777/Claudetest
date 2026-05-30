import { describe, it, expect } from 'vitest';
import {
  createEventEnvelope,
  envelopeToKafkaKey,
} from '../events/event-envelope';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_8601_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    type: 'production.order.created',
    source: 'urn:mes:production-service:ProductionOrder',
    aggregateId: 'order-123',
    aggregateType: 'ProductionOrder',
    sequence: 1,
    data: { orderId: 'order-123' },
    ...overrides,
  };
}

describe('createEventEnvelope', () => {
  it('generates a unique UUID v4 id', () => {
    const env = createEventEnvelope(makeParams());
    expect(env.id).toMatch(UUID_V4_REGEX);
  });

  it('sets specversion to "1.0"', () => {
    const env = createEventEnvelope(makeParams());
    expect(env.specversion).toBe('1.0');
  });

  it('sets datacontenttype to "application/json"', () => {
    const env = createEventEnvelope(makeParams());
    expect(env.datacontenttype).toBe('application/json');
  });

  it('sets time to a valid ISO 8601 string', () => {
    const env = createEventEnvelope(makeParams());
    expect(env.time).toMatch(ISO_8601_REGEX);
    expect(() => new Date(env.time)).not.toThrow();
    expect(new Date(env.time).toISOString()).toBe(env.time);
  });

  it('defaults correlationId to a new UUID when not provided', () => {
    const env = createEventEnvelope(makeParams());
    expect(env.correlationId).toMatch(UUID_V4_REGEX);
  });

  it('uses provided correlationId', () => {
    const corrId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const env = createEventEnvelope(makeParams({ correlationId: corrId }));
    expect(env.correlationId).toBe(corrId);
  });

  it('passes through causationId when provided', () => {
    const causId = '11111111-2222-4333-8444-555555555555';
    const env = createEventEnvelope(makeParams({ causationId: causId }));
    expect(env.causationId).toBe(causId);
  });

  it('omits causationId when not provided', () => {
    const env = createEventEnvelope(makeParams());
    expect(Object.prototype.hasOwnProperty.call(env, 'causationId')).toBe(false);
  });

  it('passes through tenantId when provided', () => {
    const env = createEventEnvelope(makeParams({ tenantId: 'site-A' }));
    expect(env.tenantId).toBe('site-A');
  });

  it('omits tenantId when not provided', () => {
    const env = createEventEnvelope(makeParams());
    expect(Object.prototype.hasOwnProperty.call(env, 'tenantId')).toBe(false);
  });

  it('produces different ids on two calls', () => {
    const env1 = createEventEnvelope(makeParams());
    const env2 = createEventEnvelope(makeParams());
    expect(env1.id).not.toBe(env2.id);
  });

  it('sets data on the envelope', () => {
    const data = { orderId: 'order-123', qty: 42 };
    const env = createEventEnvelope(makeParams({ data }));
    expect(env.data).toEqual(data);
  });
});

describe('envelopeToKafkaKey', () => {
  it('returns "AggregateType:aggregateId" format', () => {
    const env = createEventEnvelope(makeParams());
    expect(envelopeToKafkaKey(env)).toBe('ProductionOrder:order-123');
  });

  it('correctly formats for different aggregate types', () => {
    const env = createEventEnvelope(
      makeParams({ aggregateType: 'QualityPlan', aggregateId: 'qp-999' }),
    );
    expect(envelopeToKafkaKey(env)).toBe('QualityPlan:qp-999');
  });
});
