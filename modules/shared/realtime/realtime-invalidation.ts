export interface RealtimeInvalidationClock {
  set: (callback: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
}

interface RealtimeInvalidationControllerOptions {
  invalidate: () => void | Promise<void>;
  delayMs?: number;
  clock?: RealtimeInvalidationClock;
}

const defaultClock: RealtimeInvalidationClock = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const createRealtimeInvalidationController = ({
  invalidate,
  delayMs = 250,
  clock = defaultClock,
}: RealtimeInvalidationControllerOptions) => {
  let active = true;
  let pendingHandle: unknown | null = null;

  const schedule = () => {
    if (!active) return;
    if (pendingHandle !== null) clock.clear(pendingHandle);
    pendingHandle = clock.set(() => {
      pendingHandle = null;
      if (!active) return;
      try {
        void Promise.resolve(invalidate()).catch(() => undefined);
      } catch {
        // Uma falha pontual de refetch não pode derrubar o callback do canal.
      }
    }, delayMs);
  };

  const onChannelStatus = (status: string) => {
    if (
      status === 'SUBSCRIBED'
      || status === 'CHANNEL_ERROR'
      || status === 'TIMED_OUT'
      || status === 'CLOSED'
    ) {
      schedule();
    }
  };

  const dispose = () => {
    active = false;
    if (pendingHandle !== null) {
      clock.clear(pendingHandle);
      pendingHandle = null;
    }
  };

  return { dispose, onChannelStatus, schedule };
};
