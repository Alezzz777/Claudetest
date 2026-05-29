import { EventEnvelope } from '../events/event-envelope';

/**
 * Abstract base class for idempotent event handlers.
 *
 * Guarantees that each event is processed exactly once, even if the same
 * event is delivered multiple times (at-least-once Kafka semantics).
 *
 * Concrete implementations must:
 *  1. Provide a backing store check via `isAlreadyProcessed`
 *  2. Record completion via `markAsProcessed`
 *  3. Implement the actual domain logic in `handle`
 */
export abstract class IdempotentEventHandler<T = unknown> {
  /**
   * The actual domain handler logic.
   * Only called when the event has not been processed before.
   */
  abstract handle(event: EventEnvelope<T>): Promise<void>;

  /**
   * Check whether the event has already been processed.
   * Typically queries a `processed_events` table by `eventId`.
   */
  abstract isAlreadyProcessed(eventId: string): Promise<boolean>;

  /**
   * Record that the event has been successfully processed.
   * Typically inserts a row into `processed_events`.
   */
  abstract markAsProcessed(eventId: string): Promise<void>;

  /**
   * Idempotent entry point.
   * Skips `handle()` silently if the event was already processed.
   * Calls `handle()` then `markAsProcessed()` otherwise.
   */
  async handleIdempotent(event: EventEnvelope<T>): Promise<void> {
    const alreadyProcessed = await this.isAlreadyProcessed(event.id);
    if (alreadyProcessed) {
      return;
    }
    await this.handle(event);
    await this.markAsProcessed(event.id);
  }
}
