type Priority = 'background' | 'interactive';
interface WaitingRead {
  priority: Priority;
  signal: AbortSignal;
  start: (release: () => void) => void;
  cancel: () => void;
}

const cancelled = () => new globalThis.DOMException('Leitura do Caixa cancelada.', 'AbortError');

/** One expensive Caixa read per tab; a requested detail precedes queued summaries. */
export function createCaixaReadQueue() {
  const waiting: WaitingRead[] = [];
  let running = false;

  const dispatch = () => {
    if (running || waiting.length === 0) return;
    const interactive = waiting.findIndex(read => read.priority === 'interactive');
    const next = waiting.splice(interactive < 0 ? 0 : interactive, 1)[0];
    next.signal.removeEventListener('abort', next.cancel);
    running = true;
    next.start(() => { running = false; dispatch(); });
  };

  return function queue<T>(signal: AbortSignal, read: () => Promise<T>, priority: Priority = 'background'): Promise<T> {
    if (signal.aborted) return Promise.reject(cancelled());
    return new Promise<T>((resolve, reject) => {
      const pending: WaitingRead = {
        priority,
        signal,
        cancel: () => {
          const index = waiting.indexOf(pending);
          if (index < 0) return;
          waiting.splice(index, 1);
          signal.removeEventListener('abort', pending.cancel);
          reject(cancelled());
        },
        start: release => {
          // The getter receives this same signal. Keep its slot until the
          // request settles, including cancellation, rather than overlap it.
          void Promise.resolve().then(() => {
            if (signal.aborted) throw cancelled();
            return read();
          }).then(value => {
            if (signal.aborted) reject(cancelled());
            else resolve(value);
          }, reject).finally(release);
        },
      };
      signal.addEventListener('abort', pending.cancel, { once: true });
      waiting.push(pending);
      dispatch();
    });
  };
}

export const queueCaixaRead = createCaixaReadQueue();
