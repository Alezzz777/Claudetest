import { EventEnvelope } from '../events/event-envelope';

/**
 * Abstract base class for DDD Aggregate Roots.
 *
 * Responsibilities:
 *  - Tracks uncommitted domain events (to be written to outbox in one transaction)
 *  - Maintains the aggregate version for optimistic concurrency control
 *  - Supports rehydration from an event stream (event sourcing)
 */
export abstract class AggregateRoot {
  protected _id: string = '';
  protected _version: number = 0;
  private _uncommittedEvents: EventEnvelope[] = [];

  /** Return the aggregate type name, e.g. "ProductionOrder" */
  abstract getAggregateType(): string;

  getId(): string {
    return this._id;
  }

  getVersion(): number {
    return this._version;
  }

  /**
   * The version to use when writing to the event store / outbox.
   * Equals the current version before the next event is applied.
   * Used for optimistic locking: writer asserts this matches DB version.
   */
  getExpectedVersion(): number {
    return this._version;
  }

  /**
   * Apply a domain event: record it as uncommitted, dispatch to the handler,
   * and increment the version counter.
   */
  protected apply(event: EventEnvelope): void {
    this._uncommittedEvents.push(event);
    this.handleEvent(event);
    this._version++;
  }

  /**
   * Dispatch the event to the appropriate handler method within the aggregate.
   * Concrete classes implement this, typically with a switch on event.type.
   */
  protected abstract handleEvent(event: EventEnvelope): void;

  /**
   * Return all events applied since the last commit and clear the internal list.
   * Call this after persisting the aggregate to extract events for the outbox.
   */
  popUncommittedEvents(): EventEnvelope[] {
    const events = [...this._uncommittedEvents];
    this._uncommittedEvents = [];
    return events;
  }

  /**
   * Reconstruct an aggregate from its full event history (event sourcing).
   * After rehydration the uncommitted list is cleared — historical events are
   * NOT uncommitted from the perspective of the current transaction.
   */
  static rehydrate<T extends AggregateRoot>(
    this: new () => T,
    events: EventEnvelope[],
  ): T {
    const instance = new this();
    for (const event of events) {
      instance.handleEvent(event);
      instance._version++;
    }
    // Historical events are already persisted — do not treat as uncommitted.
    instance._uncommittedEvents = [];
    return instance;
  }
}
