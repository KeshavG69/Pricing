/**
 * Request deduplication utility to prevent duplicate API calls.
 *
 * If the same API call is already in flight, this utility returns
 * the existing promise instead of making a new request.
 */

const inflightRequests = new Map<string, Promise<any>>();

/**
 * Deduplicate API requests by caching in-flight promises.
 *
 * @param key - Unique identifier for the request (e.g., "proposals:list:org123")
 * @param requestFn - Function that performs the API call
 * @returns Promise with the API response
 *
 * @example
 * ```typescript
 * const proposals = await deduplicateRequest(
 *   'proposals:list:123',
 *   () => proposalsApi.list()
 * );
 * ```
 */
export function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // If request already in flight, return existing promise
  if (inflightRequests.has(key)) {
    console.log(`[DEDUPE] Reusing in-flight request: ${key}`);
    return inflightRequests.get(key)!;
  }

  // Start new request
  console.log(`[DEDUPE] Starting new request: ${key}`);
  const promise = requestFn().finally(() => {
    // Remove from map when complete (success or error)
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

/**
 * Clear all in-flight requests (useful for testing or logout).
 */
export function clearInflightRequests() {
  inflightRequests.clear();
}
