// Sparkplug B message types
export type SparkplugMessageType = 'NBIRTH' | 'DBIRTH' | 'NDATA' | 'DDATA' | 'NDEATH' | 'DDEATH';

export interface SparkplugMetric {
  name: string;
  value: number | string | boolean | null;
  type: string;
  timestamp: number;
}

export interface DecodedSparkplugMessage {
  timestamp: number;
  metrics: SparkplugMetric[];
  seq?: number;
}

export class SparkplugDecoder {
  /**
   * Decodes Sparkplug B payloads.
   * Topic format: spBv1.0/<groupId>/<messageType>/<edgeNodeId>[/<deviceId>]
   *
   * NOTE: This is a simplified implementation. In production, Sparkplug B payloads
   * are encoded with Protocol Buffers using the Sparkplug B proto definition.
   * A production implementation would use the 'sparkplug-b' npm package or protobufjs
   * with the official Sparkplug.proto schema.
   */

  parseTopic(topic: string): {
    groupId: string;
    messageType: SparkplugMessageType;
    edgeNodeId: string;
    deviceId?: string;
  } | null {
    const parts = topic.split('/');
    if (parts.length < 4) return null;
    if (parts[0] !== 'spBv1.0') return null;

    const [, groupId, messageType, edgeNodeId, deviceId] = parts as [
      string,
      string,
      string,
      string,
      string | undefined,
    ];

    const validTypes: SparkplugMessageType[] = ['NBIRTH', 'DBIRTH', 'NDATA', 'DDATA', 'NDEATH', 'DDEATH'];
    if (!validTypes.includes(messageType as SparkplugMessageType)) return null;

    return {
      groupId,
      messageType: messageType as SparkplugMessageType,
      edgeNodeId,
      deviceId,
    };
  }

  decode(buffer: Buffer): DecodedSparkplugMessage {
    // Simplified decoder:
    // 1. Try JSON.parse first (for testing with JSON payloads)
    // 2. Fall back to treating buffer as raw JSON string
    // In production this would use sparkplug-b npm package or protobufjs
    try {
      const parsed = JSON.parse(buffer.toString()) as {
        timestamp?: number;
        metrics?: Array<{
          name?: string;
          value?: number | string | boolean | null;
          type?: string;
          timestamp?: number;
        }>;
        seq?: number;
      };
      return {
        timestamp: parsed.timestamp ?? Date.now(),
        seq: parsed.seq,
        metrics: (parsed.metrics ?? []).map((m) => ({
          name: m.name ?? '',
          value: m.value ?? null,
          type: m.type ?? 'Unknown',
          timestamp: m.timestamp ?? parsed.timestamp ?? Date.now(),
        })),
      };
    } catch {
      return { timestamp: Date.now(), metrics: [], seq: 0 };
    }
  }

  isDeathMessage(messageType: SparkplugMessageType): boolean {
    return messageType === 'NDEATH' || messageType === 'DDEATH';
  }
}
