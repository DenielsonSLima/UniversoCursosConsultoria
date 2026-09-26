/* global ReadableStream: readonly, ReadableStreamDefaultController: readonly */
type DispatchRequest = (
  input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1], onDispatch: () => void,
) => ReturnType<typeof fetch>;
const dispatchCapability = Symbol('proesc-v1-dispatch');
type CoordinatedTransport = typeof fetch & { [dispatchCapability]?: DispatchRequest };

/** Start network deadlines only after a coordinated transport acquires its slot. */
export function runProescV1Transport(
  transport: typeof fetch, input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1], onDispatch: () => void,
): ReturnType<typeof fetch> {
  const dispatch = (transport as CoordinatedTransport)[dispatchCapability];
  if (dispatch) return dispatch(input, init, onDispatch);
  onDispatch();
  return transport(input, init);
}

// One gate per internal_sync execution, shared by accounting and cycle review.
// No provider quota is assumed. Queue waits use the caller's global AbortSignal;
// the client starts its HTTP budget at dispatch, retaining it through body EOF.
export function createProescV1PacedTransport(
  transport: typeof fetch, options: { intervalMs?: number } = {},
): typeof fetch {
  const intervalMs = options.intervalMs ?? 0;
  if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 100) {
    throw new Error('Invalid internal Proesc request interval');
  }
  let tail = Promise.resolve();
  let nextStartAt = 0;
  const stopped = new AbortController();
  const cancelled = () => new Error('PROESC_READ_CANCELLED');
  const blocked = () => new Error('PROESC_SOURCE_READ_BLOCKED');

  const wait = async (pending: Promise<void>, signal?: AbortSignal | null) => {
    if (signal?.aborted || stopped.signal.aborted) throw cancelled();
    let onAbort: () => void = () => undefined;
    const abort = new Promise<never>((_, reject) => {
      onAbort = () => reject(cancelled());
      signal?.addEventListener('abort', onAbort, { once: true });
      stopped.signal.addEventListener('abort', onAbort, { once: true });
    });
    try { await Promise.race([pending, abort]); }
    finally {
      signal?.removeEventListener('abort', onAbort);
      stopped.signal.removeEventListener('abort', onAbort);
    }
  };

  const dispatch: DispatchRequest = async (input, init, onDispatch) => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (stopped.signal.aborted) throw blocked();
    if (signal?.aborted) throw cancelled();
    const previous = tail;
    let releaseSlot: () => void = () => undefined;
    const complete = new Promise<void>((resolve) => { releaseSlot = resolve; });
    // Cancelling a queued reader cannot let its successor bypass the active one.
    tail = previous.then(() => complete);
    let started = false;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (started) nextStartAt = Date.now() + intervalMs;
      releaseSlot();
    };
    try {
      await wait(previous, signal);
      const delay = Math.max(0, nextStartAt - Date.now());
      if (delay) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await wait(new Promise<void>((resolve) => { timer = setTimeout(resolve, delay); }), signal); }
        finally { clearTimeout(timer); }
      }
      if (signal?.aborted || stopped.signal.aborted) throw cancelled();
      started = true;
      const response = await runProescV1Transport(transport, input, init, onDispatch);
      if (response.status !== 200) stopped.abort();
      if (signal?.aborted) {
        await response.body?.cancel().catch(() => undefined);
        throw cancelled();
      }
      if (!response.body) { release(); return response; }

      // fetch resolves at headers. Hold the slot until the body is consumed or
      // cancelled, so the second reader cannot overlap a still-running GET.
      const reader = response.body.getReader();
      let ended = false;
      let bodyController: ReadableStreamDefaultController<Uint8Array>;
      const finish = () => {
        if (ended) return;
        ended = true;
        signal?.removeEventListener('abort', onAbort);
        release();
      };
      const cancelBody = async () => {
        try { await reader.cancel(); } catch { /* Never expose provider errors. */ }
        finally { finish(); }
      };
      const onAbort = () => {
        if (ended) return;
        bodyController.error(cancelled());
        void cancelBody();
      };
      const body = new ReadableStream<Uint8Array>({
        start(controller) { bodyController = controller; },
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (ended || signal?.aborted) return;
            if (chunk.done) { controller.close(); finish(); }
            else controller.enqueue(chunk.value);
          } catch {
            if (ended) return;
            if (!signal?.aborted) stopped.abort();
            controller.error(blocked());
            await cancelBody();
          }
        },
        async cancel() {
          if (!ended && !signal?.aborted) stopped.abort();
          await cancelBody();
        },
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      return new Response(body, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    } catch {
      if (started && !signal?.aborted) stopped.abort();
      release();
      // Neither URLs, credentials, provider messages nor error causes escape.
      throw signal?.aborted ? cancelled() : blocked();
    }
  };
  const coordinated: typeof fetch = (input, init) => dispatch(input, init, () => undefined);
  return Object.assign(coordinated, { [dispatchCapability]: dispatch });
}
