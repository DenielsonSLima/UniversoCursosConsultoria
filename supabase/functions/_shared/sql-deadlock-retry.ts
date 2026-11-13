type SqlResult<T> = { data: T; error: unknown };

// A resolved PostgREST 40P01 means the entire SQL transaction was rolled back.
// Retry only that final RPC, never its surrounding bank request or workflow.
export async function retrySqlDeadlock<T>(call: () => PromiseLike<SqlResult<T>>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const { data, error } = await call();
    if (!error) return data;
    if (attempt === 3 || typeof error !== 'object' || error === null ||
      !('code' in error) || error.code !== '40P01') throw error;
    await new Promise(resolve => setTimeout(resolve, 25 * attempt));
  }
}
