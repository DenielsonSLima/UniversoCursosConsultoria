export interface EadProgressOperationInput {
  alunoId: string;
  courseId: string;
  action: string;
  itemId?: string | null;
  payload?: Record<string, unknown>;
}

export interface EadProgressOperationSnapshot {
  pendingCount: number;
  pendingKeys: string[];
}

export interface EadActivityDraftDescriptor {
  draftKey: string;
  activityId: string;
  persistedAnswer: string;
}

export interface EadActivityDraftSave {
  draftKey: string;
  activityId: string;
  answer: string;
}

export interface EadProgressAvailability {
  isReady: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  hasBlockingError: boolean;
  hasRefreshError: boolean;
}

interface EadProgressOperationJob<T> {
  input: EadProgressOperationInput;
  key: string;
  latestWins: boolean;
  revision: number;
  executedRevision: number;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export interface EadProgressOperationQueue<T> {
  enqueue: (input: EadProgressOperationInput) => Promise<T>;
  getSnapshot: () => EadProgressOperationSnapshot;
  subscribe: (listener: (snapshot: EadProgressOperationSnapshot) => void) => () => void;
}

export const getEadProgressOperationKey = (input: EadProgressOperationInput) => (
  `${input.alunoId}:${input.courseId}:${input.action}:${input.itemId || ''}`
);

export const getEadActivityDraftKey = (
  contextKey: string,
  activityIndex: number,
  activityId: unknown,
) => `${contextKey || 'contexto'}:${activityIndex}:${typeof activityId === 'string' && activityId || 'sem-id'}`;

export const getPendingEadActivityDraftSaves = (
  drafts: Record<string, string>,
  descriptors: EadActivityDraftDescriptor[],
): EadActivityDraftSave[] => descriptors.flatMap((descriptor) => {
  if (!Object.prototype.hasOwnProperty.call(drafts, descriptor.draftKey)) return [];
  const answer = drafts[descriptor.draftKey];
  if (answer === descriptor.persistedAnswer || !answer.trim()) return [];
  return [{ draftKey: descriptor.draftKey, activityId: descriptor.activityId, answer }];
});

export const getEadDraftsAfterConfirmedSave = (
  drafts: Record<string, string>,
  save: EadActivityDraftSave,
  confirmedAnswer: unknown,
) => {
  if (confirmedAnswer !== save.answer || drafts[save.draftKey] !== save.answer) return drafts;
  const next = { ...drafts };
  delete next[save.draftKey];
  return next;
};

export const flushEadActivityDraftSaves = async <T>(
  saves: EadActivityDraftSave[],
  save: (draft: EadActivityDraftSave) => Promise<T>,
) => {
  for (const draft of saves) await save(draft);
  return saves.length;
};

export const getEadProgressAvailability = (
  hasData: boolean,
  isFetching: boolean,
  isError: boolean,
): EadProgressAvailability => ({
  isReady: hasData,
  isLoading: !hasData && !isError,
  isRefreshing: hasData && isFetching,
  hasBlockingError: !hasData && isError,
  hasRefreshError: hasData && isError,
});

const getActivityAnswer = (input: EadProgressOperationInput) => input.payload?.answer;

export const createEadProgressOperationQueue = <T>(
  execute: (input: EadProgressOperationInput) => Promise<T>,
): EadProgressOperationQueue<T> => {
  const jobs: EadProgressOperationJob<T>[] = [];
  const pendingByKey = new Map<string, EadProgressOperationJob<T>>();
  const listeners = new Set<(snapshot: EadProgressOperationSnapshot) => void>();
  let running = false;

  const getSnapshot = (): EadProgressOperationSnapshot => ({
    pendingCount: pendingByKey.size,
    pendingKeys: [...pendingByKey.keys()],
  });

  const notify = () => {
    const snapshot = getSnapshot();
    listeners.forEach(listener => listener(snapshot));
  };

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      while (jobs.length > 0) {
        const job = jobs[0];
        try {
          let result!: T;
          while (true) {
            const revision = job.revision;
            const input = job.input;
            try {
              result = await execute(input);
              job.executedRevision = revision;
            } catch (error) {
              if (job.latestWins && revision < job.revision) continue;
              job.reject(error);
              break;
            }
            if (!job.latestWins || job.executedRevision >= job.revision) {
              job.resolve(result);
              break;
            }
          }
        } finally {
          jobs.shift();
          if (pendingByKey.get(job.key) === job) pendingByKey.delete(job.key);
          notify();
        }
      }
    } finally {
      running = false;
      if (jobs.length > 0) void pump();
    }
  };

  const enqueue = (input: EadProgressOperationInput) => {
    const key = getEadProgressOperationKey(input);
    const existing = pendingByKey.get(key);
    if (existing) {
      if (existing.latestWins && !Object.is(getActivityAnswer(existing.input), getActivityAnswer(input))) {
        existing.input = input;
        existing.revision += 1;
      }
      return existing.promise;
    }

    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const job: EadProgressOperationJob<T> = {
      input,
      key,
      latestWins: input.action === 'set_activity_answer',
      revision: 1,
      executedRevision: 0,
      promise,
      resolve,
      reject,
    };
    jobs.push(job);
    pendingByKey.set(key, job);
    notify();
    void pump();
    return promise;
  };

  return {
    enqueue,
    getSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(getSnapshot());
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const getEadRetryReleaseToken = (
  courseId: unknown,
  retryAvailableAtMs: unknown,
  nowMs: number,
) => {
  const normalizedCourseId = typeof courseId === 'string' ? courseId.trim() : '';
  const normalizedRetryAt = Number(retryAvailableAtMs);
  if (!normalizedCourseId || !Number.isFinite(normalizedRetryAt) || normalizedRetryAt <= 0) return null;
  if (nowMs < normalizedRetryAt) return null;
  return `${normalizedCourseId}:${Math.trunc(normalizedRetryAt)}`;
};

export const getEadServerConfirmedRetryUnlockToken = (
  previousCourseId: unknown,
  previousBlocked: boolean,
  currentCourseId: unknown,
  currentBlocked: boolean,
  retryAvailableAtMs: unknown,
) => {
  const previousId = typeof previousCourseId === 'string' ? previousCourseId.trim() : '';
  const currentId = typeof currentCourseId === 'string' ? currentCourseId.trim() : '';
  if (!currentId || previousId !== currentId || !previousBlocked || currentBlocked) return null;
  const normalizedRetryAt = Number(retryAvailableAtMs);
  return `${currentId}:${Number.isFinite(normalizedRetryAt) && normalizedRetryAt > 0
    ? Math.trunc(normalizedRetryAt)
    : 'server'}`;
};
