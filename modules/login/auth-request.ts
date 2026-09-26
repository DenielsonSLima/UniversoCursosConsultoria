export const AUTH_REQUEST_TIMEOUT_MS = 15_000;
export const AUTH_TIMEOUT_MESSAGE =
  'O serviço de acesso demorou para responder. Tente novamente em instantes.';

export class AuthRequestTimeoutError extends Error {
  readonly code = 'AUTH_REQUEST_TIMEOUT';

  constructor() {
    super(AUTH_TIMEOUT_MESSAGE);
    this.name = 'AuthRequestTimeoutError';
  }
}

export const checkAuthRequest = (signal?: AbortSignal) => {
  if (signal?.aborted) throw signal.reason || new AuthRequestTimeoutError();
};

/** Cancela a rede e também limita esperas anteriores ao fetch, como o Auth SDK. */
export const withAuthDeadline = <T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  { signal, timeoutMs = AUTH_REQUEST_TIMEOUT_MS }: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> => new Promise((resolve, reject) => {
  const controller = new AbortController();
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  };
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback();
  };
  const abort = (reason: unknown) => finish(() => {
    controller.abort(reason);
    reject(reason);
  });
  const cancel = () => abort(signal?.reason || new AuthRequestTimeoutError());
  if (signal?.aborted) return cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  timer = setTimeout(() => abort(new AuthRequestTimeoutError()), timeoutMs);
  try {
    Promise.resolve(request(controller.signal)).then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    );
  } catch (error) {
    finish(() => reject(error));
  }
});
