import { describe, it, expect } from 'vitest';
import { B2MMLParser, B2MMLBuilder } from '../adapters/erp-b2mml/b2mml-parser';

const validXml = `<?xml version="1.0"?>
<ProductionSchedule>
  <ProductionRequest>
    <ID>ORD-001</ID>
    <MaterialProducedID>PROD-A</MaterialProducedID>
    <Quantity>
      <QuantityString>100</QuantityString>
      <UnitOfMeasure>EA</UnitOfMeasure>
    </Quantity>
    <EarliestStartTime>2026-06-01T08:00:00Z</EarliestStartTime>
    <LatestEndTime>2026-06-01T16:00:00Z</LatestEndTime>
    <WorkCenterID>WC-01</WorkCenterID>
  </ProductionRequest>
</ProductionSchedule>`;

describe('B2MMLParser', () => {
  const parser = new B2MMLParser();

  it('parses valid production schedule XML', async () => {
    const orders = await parser.parseProductionSchedule(validXml);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.id).toBe('ORD-001');
    expect(orders[0]?.productCode).toBe('PROD-A');
    expect(orders[0]?.quantity).toBe(100);
    expect(orders[0]?.uom).toBe('EA');
    expect(orders[0]?.workCenterId).toBe('WC-01');
  });

  it('returns empty array for invalid XML', async () => {
    const orders = await parser.parseProductionSchedule('<invalid>xml</bad>');
    expect(orders).toEqual([]);
  });

  it('returns empty array for XML without ProductionSchedule', async () => {
    const orders = await parser.parseProductionSchedule('<Root><Other/></Root>');
    expect(orders).toEqual([]);
  });
});

describe('B2MMLBuilder', () => {
  const builder = new B2MMLBuilder();

  it('builds performance report XML', () => {
    const xml = builder.buildPerformanceReport([
      {
        orderId: 'ORD-001',
        productCode: 'PROD-A',
        plannedQty: 100,
        actualQty: 95,
        scrapQty: 5,
        startAt: '2026-06-01T08:00:00Z',
        endAt: '2026-06-01T16:00:00Z',
        oee: 0.95,
      },
    ]);
    expect(xml).toContain('<ProductionPerformance>');
    expect(xml).toContain('ORD-001');
    expect(xml).toContain('PROD-A');
  });

  it('buildAck returns valid XML with ACCEPTED status', () => {
    const xml = builder.buildAck('order1', 'ACCEPTED');
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);
    expect(xml).toContain('ACCEPTED');
    expect(xml).toContain('order1');
  });

  it('buildAck includes reason when provided', () => {
    const xml = builder.buildAck('order2', 'REJECTED', 'Capacity exceeded');
    expect(xml).toContain('REJECTED');
    expect(xml).toContain('Capacity exceeded');
  });
});
