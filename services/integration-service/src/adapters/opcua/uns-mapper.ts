export interface UnsMapping {
  nodeId: string;
  site: string;
  area: string;
  line: string;
  device: string;
  metric: string;
}

export class UnsMapper {
  constructor(private readonly mappingConfig: Record<string, UnsMapping>) {}

  map(nodeId: string): UnsMapping | null {
    // Parse "ns=<ns>;s=<identifier>" or "ns=<ns>;i=<numericId>"
    const match = nodeId.match(/^ns=\d+;([si])=(.+)$/);
    if (!match) return null;

    const [, type, identifier] = match as [string, string, string];

    if (type === 's') {
      const parts = identifier.split('.');
      if (parts.length < 5) return null;
      const [site, area, line, device, ...metricParts] = parts as [string, string, string, string, ...string[]];
      const metric = metricParts.join('.');
      return { nodeId, site, area, line, device, metric };
    } else {
      // Numeric id — look up in mappingConfig
      return this.mappingConfig[identifier] ?? null;
    }
  }

  toKafkaTopic(mappingOrPath: UnsMapping | string): string {
    if (typeof mappingOrPath === 'string') {
      return mappingOrPath;
    }
    const m = mappingOrPath;
    return `mes.uns.${m.site}.${m.area}.${m.line}.${m.device}`;
  }
}
