import { delay } from './delay.util';

export interface BatchProcessingOptions {
  /**
   * Maximum number of concurrent promises
   * @default 5
   */
  concurrencyLimit?: number;

  /**
   * Delay in milliseconds between batches
   * Can be a number or a function that receives rate limit count and returns a number
   * @default 0
   */
  delayBetweenBatches?: number | ((rateLimitCount?: number) => number);

  /**
   * Whether to throw on first error or collect all results
   * @default false (collect all)
   */
  throwOnError?: boolean;
}

export type BatchResult<R> =
  | {
      success: true;
      value: R;
      index: number;
    }
  | {
      success: false;
      error: Error;
      index: number;
    };

/**
 * Type guard to check if a BatchResult is successful
 */
function isSuccessResult<R>(
  result: BatchResult<R>,
): result is { success: true; value: R; index: number } {
  return result.success === true;
}

/**
 * Type guard to check if a BatchResult is a failure
 */
function isErrorResult<R>(
  result: BatchResult<R>,
): result is { success: false; error: Error; index: number } {
  return result.success === false;
}

/**
 * Process an array of items in batches with controlled concurrency
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param options - Batch processing options
 * @returns Array of results in the same order as input
 *
 * @example
 * const results = await batchProcessWithLimit(
 *   memberIds,
 *   (id) => apiClient.getMember(id),
 *   { concurrencyLimit: 5, delayBetweenBatches: 200 }
 * );
 */
export async function batchProcessWithLimit<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: BatchProcessingOptions = {},
): Promise<BatchResult<R>[]> {
  const {
    concurrencyLimit = 5,
    delayBetweenBatches = 0,
    throwOnError = false,
  } = options;

  if (items.length === 0) {
    return [];
  }

  const results: BatchResult<R>[] = [];

  for (let i = 0; i < items.length; i += concurrencyLimit) {
    const chunk = items.slice(i, i + concurrencyLimit);
    const startIndex = i;

    const chunkPromises = chunk.map((item, chunkIndex) => {
      const globalIndex = startIndex + chunkIndex;
      return processor(item, globalIndex)
        .then(
          (value): BatchResult<R> => ({
            success: true,
            value,
            index: globalIndex,
          }),
        )
        .catch(
          (error): BatchResult<R> => ({
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            index: globalIndex,
          }),
        );
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    if (throwOnError) {
      const firstError = chunkResults.find(isErrorResult);
      if (firstError) {
        throw firstError.error;
      }
    }

    if (i + concurrencyLimit < items.length) {
      const rateLimitCount = chunkResults.filter((r) => {
        if (r.success) {
          const value = r.value as any;
          return value?.isRateLimit === true;
        }
        return false;
      }).length;

      const delayMs =
        typeof delayBetweenBatches === 'function'
          ? delayBetweenBatches(rateLimitCount)
          : delayBetweenBatches || 0;
      if (delayMs > 0) {
        await delay(delayMs);
      }
    }
  }

  return results;
}

/**
 * Process items in batches and return only successful results
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param options - Batch processing options
 * @returns Array of successful results
 */
export async function batchProcessSuccessful<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: BatchProcessingOptions = {},
): Promise<R[]> {
  const results = await batchProcessWithLimit(items, processor, options);
  return results.filter(isSuccessResult).map((r) => r.value);
}

/**
 * Process items in batches and collect errors separately
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param options - Batch processing options
 * @returns Object with successful values and errors
 */
export async function batchProcessWithErrors<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: BatchProcessingOptions = {},
): Promise<{
  successful: R[];
  failed: Array<{ item: T; error: Error; index: number }>;
}> {
  const results = await batchProcessWithLimit(items, processor, options);

  const successful: R[] = [];
  const failed: Array<{ item: T; error: Error; index: number }> = [];

  results.forEach((result) => {
    if (isSuccessResult(result)) {
      successful.push(result.value);
    } else {
      failed.push({
        item: items[result.index],
        error: result.error,
        index: result.index,
      });
    }
  });

  return { successful, failed };
}

/**
 * Deduplicate items before processing
 * Useful when you want to avoid processing the same item multiple times
 *
 * @param items - Array of items
 * @param keyExtractor - Function to extract unique key from item
 * @returns Array of deduplicated items
 */
export function deduplicateItems<T>(
  items: T[],
  keyExtractor: (item: T) => string | number,
): T[] {
  const seen = new Set<string | number>();
  const deduplicated: T[] = [];

  for (const item of items) {
    const key = keyExtractor(item);
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}
