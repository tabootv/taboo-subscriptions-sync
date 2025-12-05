/**
 * Utility function to create a delay/sleep in async code
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the specified time
 *
 * @example
 * await delay(1000); // Wait 1 second
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Creates a delay with exponential backoff
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Promise that resolves after calculated delay
 *
 * @example
 * await exponentialBackoff(0, 1000); // 1s
 * await exponentialBackoff(1, 1000); // 2s
 * await exponentialBackoff(2, 1000); // 4s
 * await exponentialBackoff(3, 1000); // 8s
 */
export const exponentialBackoff = (
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000,
): Promise<void> => {
  const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  return delay(delayMs);
};

/**
 * Adds jitter (randomness) to a delay to prevent thundering herd problem
 * @param baseDelayMs - Base delay in milliseconds
 * @param jitterPercent - Percentage of jitter (0-100), default 20%
 * @returns Delay with jitter applied
 */
export const delayWithJitter = (
  baseDelayMs: number,
  jitterPercent: number = 20,
): Promise<void> => {
  const jitter = (baseDelayMs * jitterPercent) / 100;
  const randomJitter = Math.random() * jitter * 2 - jitter;
  const delayMs = Math.max(0, baseDelayMs + randomJitter);
  return delay(delayMs);
};

/**
 * Parse Retry-After header value or error message
 * @param retryAfter - Can be number (seconds), HTTP date string, or error message
 * @param errorMessage - Optional error message to extract retry time from
 * @returns Milliseconds to wait
 */
export const parseRetryAfter = (
  retryAfter: string | number | undefined,
  errorMessage?: string,
): number => {
  if (errorMessage) {
    const messageMatch = errorMessage.match(/try again in (\d+) seconds?/i);
    if (messageMatch) {
      const seconds = Number.parseInt(messageMatch[1], 10);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
    }
  }

  if (!retryAfter) return 5000;

  if (typeof retryAfter === 'number') {
    return retryAfter * 1000;
  }

  const seconds = Number.parseInt(retryAfter, 10);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const retryDate = new Date(retryAfter);
  if (!Number.isNaN(retryDate.getTime())) {
    const now = Date.now();
    const diff = retryDate.getTime() - now;
    return Math.max(diff, 5000);
  }

  return 5000;
};
