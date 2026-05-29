import { describe, it, expect } from 'vitest';
import { SparkplugDecoder } from '../adapters/mqtt-sparkplug/sparkplug-decoder';

describe('SparkplugDecoder', () => {
  const decoder = new SparkplugDecoder();

  it('parses a valid topic with device id', () => {
    const result = decoder.parseTopic('spBv1.0/Group1/NBIRTH/Edge1/Dev1');
    expect(result).not.toBeNull();
    expect(result?.groupId).toBe('Group1');
    expect(result?.messageType).toBe('NBIRTH');
    expect(result?.edgeNodeId).toBe('Edge1');
    expect(result?.deviceId).toBe('Dev1');
  });

  it('parses a valid topic without device id', () => {
    const result = decoder.parseTopic('spBv1.0/Group1/NDATA/Edge1');
    expect(result?.deviceId).toBeUndefined();
    expect(result?.messageType).toBe('NDATA');
  });

  it('returns null for invalid topic', () => {
    expect(decoder.parseTopic('invalid')).toBeNull();
    expect(decoder.parseTopic('not/sparkplug/NBIRTH/edge')).toBeNull();
  });

  it('isDeathMessage returns true for NDEATH', () => {
    expect(decoder.isDeathMessage('NDEATH')).toBe(true);
  });

  it('isDeathMessage returns true for DDEATH', () => {
    expect(decoder.isDeathMessage('DDEATH')).toBe(true);
  });

  it('isDeathMessage returns false for NDATA', () => {
    expect(decoder.isDeathMessage('NDATA')).toBe(false);
  });

  it('decode parses JSON payload', () => {
    const payload = { timestamp: 1000, metrics: [{ name: 'Temp', value: 25, type: 'Float', timestamp: 1000 }], seq: 1 };
    const result = decoder.decode(Buffer.from(JSON.stringify(payload)));
    expect(result.timestamp).toBe(1000);
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]?.name).toBe('Temp');
    expect(result.seq).toBe(1);
  });

  it('decode returns empty metrics on invalid buffer', () => {
    const result = decoder.decode(Buffer.from('not json'));
    expect(result.metrics).toHaveLength(0);
    expect(result.seq).toBe(0);
  });
});
