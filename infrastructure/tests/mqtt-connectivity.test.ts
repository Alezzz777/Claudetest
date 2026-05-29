import { describe, it, expect, afterAll } from 'vitest';
import mqtt from 'mqtt';

const SKIP = process.env['SKIP_INFRA_TESTS'] === 'true';

describe.skipIf(SKIP)('MQTT connectivity', () => {
  let client: mqtt.MqttClient;

  afterAll(async () => {
    if (client?.connected) {
      await new Promise<void>((resolve) => client.end(false, {}, resolve));
    }
  });

  it('round-trips a message on test/connectivity within 5 seconds', async () => {
    const TOPIC = 'test/connectivity';
    const payload = JSON.stringify({ ts: Date.now() });

    const received = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('MQTT round-trip timeout after 5s')),
        5_000,
      );

      client = mqtt.connect('mqtt://localhost:1883', {
        connectTimeout: 4_000,
        clientId: `infra-test-${Date.now()}`,
      });

      client.on('connect', () => {
        client.subscribe(TOPIC, (err) => {
          if (err) {
            clearTimeout(timer);
            reject(err);
            return;
          }
          client.publish(TOPIC, payload);
        });
      });

      client.on('message', (_topic, message) => {
        clearTimeout(timer);
        resolve(message.toString());
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(received).toBe(payload);
  });
});
