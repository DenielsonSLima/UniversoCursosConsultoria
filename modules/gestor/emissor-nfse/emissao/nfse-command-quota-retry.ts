interface Options {
  signal: AbortSignal;
  onWaiting: (waiting: boolean) => void;
  attemptTimeoutMs?: number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}
const abortError = () => new globalThis.DOMException('A intenção de envio foi encerrada.', 'AbortError');
function waitForQuota(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const finish = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const timer = window.setTimeout(finish, milliseconds);
    const cancel = () => { window.clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(abortError()); };
    signal.addEventListener('abort', cancel, { once: true });
  });
}
async function boundedAttempt<T>(task: () => Promise<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  if (signal.aborted) throw abortError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([task(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('A resposta do envio não chegou no prazo. O acompanhamento automático continua sem repetir o pedido.')), milliseconds);
      cancel = () => reject(abortError());
      signal.addEventListener('abort', cancel, { once: true });
    })]);
  } finally { clearTimeout(timer); if (cancel) signal.removeEventListener('abort', cancel); }
}
/** Repeat only a command proven rejected before dispatch, within the same visible user intent. */
export async function runNfseCommandWithQuotaRetry<T>(task: () => Promise<T>, options: Options): Promise<{ result: T; quotaDeferred: boolean }> {
  let quotaDeferred = false;
  for (;;) {
    try {
      const result = await boundedAttempt(task, options.signal, options.attemptTimeoutMs ?? 45_000);
      return { result, quotaDeferred };
    } catch (error) {
      const detail = error as { status?: number; code?: string; beforeDispatch?: boolean; retryAfterMs?: number };
      if (options.signal.aborted || detail?.status !== 429 || detail.code !== 'RATE_LIMITED' || detail.beforeDispatch !== true) throw error;
      quotaDeferred = true;
      const delay = Math.max(60_000, Number.isFinite(detail.retryAfterMs) ? detail.retryAfterMs! : 0);
      options.onWaiting(true);
      try { await (options.wait ?? waitForQuota)(delay, options.signal); }
      finally { options.onWaiting(false); }
    }
  }
}
