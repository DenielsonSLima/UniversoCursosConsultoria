export class ReceivablesTimeoutError extends Error {
  constructor() {
    super('A consulta de recebíveis demorou demais. Tente novamente.');
    this.name = 'ReceivablesTimeoutError';
  }
}

// O prazo inclui a espera pela sessão, antes de o fetch do Supabase iniciar.
export async function readReceivablesRequest<T>(
  execute: (signal: AbortSignal) => PromiseLike<T>,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new globalThis.DOMException('Consulta cancelada.', 'AbortError'));
      controller.abort();
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new ReceivablesTimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      deadline,
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return execute(controller.signal);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

export const receivablesReadQueryOptions = {
  retry: (failureCount: number, error: unknown) => {
    if (error instanceof ReceivablesTimeoutError) return false;
    const code = (error as { code?: string } | null)?.code;
    // Não repetir imediatamente consultas que já esgotaram o tempo no banco.
    return failureCount < 1 && code !== '57014' && code !== '42501';
  },
};
