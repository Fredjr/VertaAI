// Retry Handler with Exponential Backoff
// Phase 3 Week 7 Days 34-35: Comprehensive error handling and retries
// Implements retry logic for transient failures with exponential backoff

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE',
    'TIMEOUT',
  ],
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  if (!error) return false;
  
  // Check error code
  if (error.code && retryableErrors.includes(error.code)) {
    return true;
  }
  
  // Check error message
  if (error.message) {
    const message = error.message.toLowerCase();
    return retryableErrors.some(code => 
      message.includes(code.toLowerCase())
    );
  }
  
  // Check HTTP status codes
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    // Retry on 429 (rate limit), 502/503/504 (server errors)
    return [429, 502, 503, 504].includes(status);
  }
  
  return false;
}

/**
 * Execute function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt < opts.maxRetries) {
    attempt++;
    
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt,
      };
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      if (!isRetryableError(error, opts.retryableErrors)) {
        console.error(`[RetryHandler] Non-retryable error on attempt ${attempt}:`, error.message);
        return {
          success: false,
          error: lastError,
          attempts: attempt,
        };
      }
      
      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxRetries) {
        console.error(`[RetryHandler] Max retries (${opts.maxRetries}) exceeded:`, error.message);
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );
      
      console.warn(
        `[RetryHandler] Attempt ${attempt}/${opts.maxRetries} failed: ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );
      
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,
  };
}

/**
 * Wrap async function with retry logic
 */
export function retryable<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: RetryOptions = {}
): (...args: T) => Promise<RetryResult<R>> {
  return async (...args: T) => {
    return withRetry(() => fn(...args), options);
  };
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Execute function with circuit breaker pattern
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  options: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
  } = {}
): Promise<T> {
  const failureThreshold = options.failureThreshold || 5;
  const resetTimeoutMs = options.resetTimeoutMs || 60000; // 1 minute

  let state = circuitBreakers.get(key) || {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed' as const,
  };

  // Check if circuit is open
  if (state.state === 'open') {
    const timeSinceLastFailure = Date.now() - state.lastFailureTime;
    if (timeSinceLastFailure < resetTimeoutMs) {
      throw new Error(`Circuit breaker open for ${key}`);
    }
    // Try half-open
    state.state = 'half-open';
  }

  try {
    const result = await fn();
    
    // Success - reset circuit breaker
    state.failures = 0;
    state.state = 'closed';
    circuitBreakers.set(key, state);
    
    return result;
  } catch (error) {
    state.failures++;
    state.lastFailureTime = Date.now();
    
    if (state.failures >= failureThreshold) {
      state.state = 'open';
      console.error(`[CircuitBreaker] Circuit opened for ${key} after ${state.failures} failures`);
    }
    
    circuitBreakers.set(key, state);
    throw error;
  }
}

