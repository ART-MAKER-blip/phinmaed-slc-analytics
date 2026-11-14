/**
 * Runs queries one after another. A single pg client (as in a transaction) must not have
 * several queries in flight at once, so use this instead of Promise.all there.
 */
export async function serial<T extends readonly (() => Promise<unknown>)[]>(
  tasks: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
