/**
 * Structured Logger (Phase 4: Observability)
 * 
 * Provides structured logging for all drift state transitions with trace IDs.
 * Enables end-to-end tracing and debugging across the 18-state machine.
 */

export interface LogContext {
  driftId: string;
  traceId?: string;
  workspaceId?: string;
  sourceType?: string;
  service?: string;
  confidence?: number;
  classificationMethod?: string;
}

export interface StateTransitionLog extends LogContext {
  level?: string;
  event: 'state_transition';
  fromState: string;
  toState: string;
  timestamp: string;
  durationMs?: number;
}

export interface ErrorLog extends LogContext {
  level?: string;
  event: 'error';
  errorCode: string;
  errorMessage: string;
  stack?: string;
  timestamp: string;
}

export interface MetricLog extends LogContext {
  level?: string;
  event: 'metric';
  metricName: string;
  metricValue: number;
  unit?: string;
  timestamp: string;
}

/**
 * Log a state transition with structured data
 */
export function logStateTransition(
  driftId: string,
  fromState: string,
  toState: string,
  context?: Partial<LogContext>,
  durationMs?: number
): void {
  const log: StateTransitionLog = {
    level: 'info',
    event: 'state_transition',
    driftId,
    fromState,
    toState,
    timestamp: new Date().toISOString(),
    durationMs,
    ...context,
  };

  console.log(JSON.stringify(log));
}

/**
 * Log an error with structured data
 */
export function logError(
  driftId: string,
  errorCode: string,
  errorMessage: string,
  context?: Partial<LogContext>,
  stack?: string
): void {
  const log: ErrorLog = {
    level: 'error',
    event: 'error',
    driftId,
    errorCode,
    errorMessage,
    stack,
    timestamp: new Date().toISOString(),
    ...context,
  };

  console.error(JSON.stringify(log));
}

/**
 * Log a metric with structured data
 */
export function logMetric(
  driftId: string,
  metricName: string,
  metricValue: number,
  context?: Partial<LogContext>,
  unit?: string
): void {
  const log: MetricLog = {
    level: 'info',
    event: 'metric',
    driftId,
    metricName,
    metricValue,
    unit,
    timestamp: new Date().toISOString(),
    ...context,
  };

  console.log(JSON.stringify(log));
}

/**
 * Generate a trace ID for a new drift
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Log a generic structured event
 */
export function logEvent(
  event: string,
  data: Record<string, any>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const log = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  if (level === 'error') {
    console.error(JSON.stringify(log));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(log));
  } else {
    console.log(JSON.stringify(log));
  }
}

