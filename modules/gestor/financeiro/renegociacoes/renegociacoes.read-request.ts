interface AbortableRead<T> {
  abortSignal(signal: AbortSignal): PromiseLike<T>;
}

/** Bound only reads; a timed-out mutation must retain its idempotent recovery contract. */
export const withRenegociacaoReadDeadline = <T>(
  request: AbortableRead<T>,
  signal?: AbortSignal,
  timeoutMs = 12_000,
): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  return new Promise<T>((resolve, reject) => {
    onAbort = () => {
      controller.abort();
      reject(new globalThis.DOMException('Consulta cancelada.', 'AbortError'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('A consulta demorou além do esperado. Tente novamente ou refine os filtros.'));
    }, timeoutMs);
    Promise.resolve(request.abortSignal(controller.signal)).then(resolve, reject);
  }).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
};
