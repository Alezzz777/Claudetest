import { describe, it, expect } from 'vitest';
import { UnsMapper } from '../adapters/opcua/uns-mapper';

describe('UnsMapper', () => {
  const mapper = new UnsMapper({});

  it('maps a valid string nodeId to UnsMapping', () => {
    const result = mapper.map('ns=2;s=Plant1.Area1.Line1.Pump1.Temperature');
    expect(result).not.toBeNull();
    expect(result?.site).toBe('Plant1');
    expect(result?.area).toBe('Area1');
    expect(result?.line).toBe('Line1');
    expect(result?.device).toBe('Pump1');
    expect(result?.metric).toBe('Temperature');
    expect(result?.nodeId).toBe('ns=2;s=Plant1.Area1.Line1.Pump1.Temperature');
  });

  it('returns null for too few path segments', () => {
    const result = mapper.map('ns=2;s=A.B');
    expect(result).toBeNull();
  });

  it('returns null for numeric nodeId with empty config', () => {
    const result = mapper.map('ns=2;i=1001');
    expect(result).toBeNull();
  });

  it('returns mapping for numeric nodeId when present in config', () => {
    const config = {
      '1001': { nodeId: 'ns=2;i=1001', site: 'S1', area: 'A1', line: 'L1', device: 'D1', metric: 'Temp' },
    };
    const m = new UnsMapper(config);
    const result = m.map('ns=2;i=1001');
    expect(result?.device).toBe('D1');
  });

  it('returns null for unrecognised format', () => {
    expect(mapper.map('invalid')).toBeNull();
  });

  it('toKafkaTopic returns correct topic string from mapping', () => {
    const mapping = mapper.map('ns=2;s=Plant1.Area1.Line1.Pump1.Temperature')!;
    const topic = mapper.toKafkaTopic(mapping);
    expect(topic).toBe('mes.uns.Plant1.Area1.Line1.Pump1');
  });

  it('toKafkaTopic accepts a string and returns it as-is', () => {
    expect(mapper.toKafkaTopic('mes.uns.custom')).toBe('mes.uns.custom');
  });
});
