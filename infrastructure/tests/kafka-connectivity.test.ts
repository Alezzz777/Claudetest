import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Kafka, Producer, Consumer, Partitioners } from 'kafkajs';

const SKIP = process.env['SKIP_INFRA_TESTS'] === 'true';

const kafka = new Kafka({
  clientId: 'infra-test-kafka',
  brokers: ['localhost:29092'],
});

let producer: Producer;
let consumer: Consumer;
const GROUP_ID = `infra-test-${Date.now()}`;

describe.skipIf(SKIP)('Kafka connectivity', () => {
  beforeAll(async () => {
    producer = kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });
    consumer = kafka.consumer({ groupId: GROUP_ID });
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: 'mes.admin.audit', fromBeginning: false });
  });

  afterAll(async () => {
    await producer.disconnect();
    await consumer.disconnect();
  });

  it('round-trips a message through mes.admin.audit within 10 seconds', async () => {
    const uniqueKey = `test-${Date.now()}`;
    const uniqueValue = `infra-connectivity-check:${uniqueKey}`;

    const received = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Kafka round-trip timeout after 10s')),
        10_000,
      );

      consumer.run({
        eachMessage: async ({ message }) => {
          const val = message.value?.toString() ?? '';
          if (val === uniqueValue) {
            clearTimeout(timer);
            resolve(val);
          }
        },
      }).catch((err) => {
        clearTimeout(timer);
        reject(err as Error);
      });
    });

    // Give the consumer a moment to start before producing
    await new Promise((r) => setTimeout(r, 500));

    await producer.send({
      topic: 'mes.admin.audit',
      messages: [{ key: uniqueKey, value: uniqueValue }],
    });

    const result = await received;
    expect(result).toBe(uniqueValue);
  });
});
