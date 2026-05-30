/**
 * Saga orchestration types.
 *
 * Each long-running business process (e.g. "Start Production Order" which
 * spans production, inventory, and quality) is modelled as a saga.
 *
 * Pattern: Saga Orchestrator stored in the DB.
 *   - State machine transitions are persisted as events (SagaStepEvent).
 *   - Compensating transactions are triggered when a step fails.
 *   - Idempotency ensured by checking saga step status before re-execution.
 */

export enum SagaStatus {
  STARTED      = 'STARTED',
  IN_PROGRESS  = 'IN_PROGRESS',
  COMPLETED    = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED  = 'COMPENSATED',
  FAILED       = 'FAILED',
}

export enum SagaStepStatus {
  PENDING      = 'PENDING',
  STARTED      = 'STARTED',
  SUCCEEDED    = 'SUCCEEDED',
  FAILED       = 'FAILED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED  = 'COMPENSATED',
  SKIPPED      = 'SKIPPED',
}

/** Persisted saga instance (stored in saga_instances table per service) */
export interface SagaInstance {
  /** Unique saga run identifier */
  sagaId: string;
  /** Type name of the saga, e.g. "StartProductionOrderSaga" */
  sagaType: string;
  /** Current saga lifecycle status */
  status: SagaStatus;
  /** JSON payload carrying the saga's context data */
  context: Record<string, unknown>;
  /** Steps and their current statuses */
  steps: SagaStepRecord[];
  /** Correlation ID linking all events of this saga */
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/** One step within a saga run */
export interface SagaStepRecord {
  stepName: string;
  stepIndex: number;
  status: SagaStepStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  retryCount: number;
  lastError: string | null;
  /** ID of the command/event sent by this step (for idempotency on retry) */
  commandId: string | null;
  /** ID of the compensating command, if compensation was triggered */
  compensationCommandId: string | null;
}

/**
 * Interface that each concrete saga must implement.
 * The orchestrator calls execute() on the current step, advancing state.
 */
export interface ISaga<TContext extends Record<string, unknown>> {
  sagaType: string;
  steps: SagaStep<TContext>[];
  execute(context: TContext, currentStepIndex: number): Promise<SagaStepResult>;
}

export interface SagaStep<TContext> {
  name: string;
  execute(context: TContext): Promise<void>;
  compensate(context: TContext): Promise<void>;
}

export interface SagaStepResult {
  success: boolean;
  nextStepIndex: number;
  error?: string;
}

/**
 * Command envelope for saga-driven commands.
 * The commandId enables idempotent re-delivery: downstream services check if
 * this commandId has already been processed before executing again.
 */
export interface SagaCommand<T = unknown> {
  commandId: string;
  sagaId: string;
  sagaType: string;
  stepName: string;
  correlationId: string;
  payload: T;
  issuedAt: string;
}
