import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';
import { useNfseOperationRealtime } from './useNfseBatchRealtime';
import type { NfseScope } from '../types/nfse.types';
import type { IndividualAttempt, IndividualCancelResult, IndividualIssueResult, NfseIndividualService } from '../individual/nfse-individual.types';

type Snapshot = IndividualIssueResult | IndividualCancelResult;
const terminal = (state: string) => ['AUTHORIZED', 'REJECTED', 'BLOCKED', 'CANCELLED', 'CANCELLATION_REJECTED'].includes(state);
/** A late snapshot must not undo a confirmed result or make a submitted preview sendable again. */
export function preserveNfseObservation<T extends Snapshot>(previous: T | undefined, next: T): T {
  if (!previous) return next;
  if (terminal(previous.state) && previous.state !== next.state
    || previous.state !== 'PREVIEWED' && next.state === 'PREVIEWED'
    || previous.state === 'AWAITING_ANALYSIS' && next.state === 'CANCELLATION_PENDING') return previous;
  if (previous.state === 'AUTHORIZED' && next.state === 'AUTHORIZED'
    && typeof previous.cancelPreviewId === 'string' && next.cancelPreviewId === null) {
    return { ...next, cancelPreviewId: previous.cancelPreviewId };
  }
  return next;
}
export const nfseIndividualObservationKey = (scope: NfseScope, attempt: IndividualAttempt | null, kind: 'issue' | 'cancel') =>
  [...nfseQueryKeys.scope(scope), 'individual-observation', kind, attempt?.requestId ?? '', attempt?.previewId ?? '',
    kind === 'cancel' ? attempt?.cancelPreviewId ?? '' : ''] as const;

function useSnapshot<T extends Snapshot>(key: readonly unknown[], snapshot: T | undefined, read: () => Promise<T>,
  enabled: boolean, paused: boolean, pending: boolean, onData: (data: T) => void, eager = false) {
  const client = useQueryClient(), identity = JSON.stringify(key);
  const queryKey = useMemo(() => key, [identity]);
  const latest = useRef({ read, enabled, paused, onData, identity, snapshot });
  latest.current = { read, enabled, paused, onData, identity, snapshot };
  const mounted = useRef(true), reading = useRef<symbol | null>(null), trailing = useRef(false), epoch = useRef(0);
  const failure = useRef({ blocked: false, nextAt: 0, count: 0 });
  const applied = useRef<{ at: number; data?: T; identity: string }>({ at: 0, identity });
  const wake = useRef<number | undefined>(undefined);
  const pauseState = useRef(paused), refreshRef = useRef<(immediate?: boolean) => void>(() => {});
  if (pauseState.current !== paused) { epoch.current++; pauseState.current = paused; }
  const query = useQuery<T>({ queryKey, enabled: false, retry: false, staleTime: Infinity, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
    structuralSharing: (previous, next) => preserveNfseObservation(previous as T | undefined, next as T),
    queryFn: async ({ signal }) => {
      const started = epoch.current;
      const token = Symbol(); reading.current = token;
      try {
        const result = await latest.current.read();
        if (signal.aborted || started !== epoch.current || latest.current.identity !== identity) throw new Error('Observation superseded.');
        failure.current = { blocked: false, nextAt: 0, count: 0 };
        return preserveNfseObservation(latest.current.snapshot, result);
      } catch (error) {
        if (!signal.aborted && started === epoch.current && latest.current.identity === identity) {
          const detail = error as { status?: number; code?: string; retryAfterMs?: number };
          const denied = [400, 401, 403].includes(detail?.status ?? 0) || detail?.code === 'INVALID_INDIVIDUAL_COMMAND';
          const count = failure.current.count + 1;
          const delay = detail?.status === 429 || detail?.code === 'RATE_LIMITED'
            ? Math.max(30_000, detail?.retryAfterMs ?? 0) : Math.min(30_000, 3000 * 2 ** Math.min(count - 1, 4));
          failure.current = { blocked: denied, nextAt: Date.now() + delay, count };
        }
        throw error;
      } finally {
        if (reading.current === token) reading.current = null;
        // A second event can arrive after this read's database snapshot was taken.
        // Wait until TanStack settles this request before consuming the trailing event.
        if (mounted.current && trailing.current) window.setTimeout(() => {
          if (mounted.current && latest.current.identity === identity) refreshRef.current(true);
        }, 0);
      }
    } });
  const refresh = useCallback((immediate = false) => {
    if (!mounted.current || !latest.current.enabled || failure.current.blocked) return;
    if (Date.now() < failure.current.nextAt) {
      if (immediate) trailing.current = true;
      window.clearTimeout(wake.current);
      wake.current = window.setTimeout(() => refreshRef.current(true), failure.current.nextAt - Date.now());
      return;
    }
    if (latest.current.paused || document.hidden || reading.current
      || client.getQueryState(queryKey)?.fetchStatus === 'fetching') {
      if (immediate) trailing.current = true;
      return;
    }
    trailing.current = false;
    void query.refetch({ cancelRefetch: false });
  }, [client, queryKey, query.refetch]);
  refreshRef.current = refresh;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; window.clearTimeout(wake.current); }; }, [identity]);
  useEffect(() => {
    failure.current = { blocked: false, nextAt: 0, count: 0 };
  }, [identity]);
  useEffect(() => {
    const visible = () => { if (!document.hidden) refresh(true); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refresh]);
  useEffect(() => {
    if (paused) { void client.cancelQueries({ queryKey, exact: true }); return; }
    if (enabled && trailing.current) refresh(true);
  }, [client, queryKey, enabled, paused, refresh]);
  useEffect(() => {
    if (eager && enabled && !paused && !snapshot) refresh(true);
  }, [eager, enabled, paused, snapshot, refresh]);
  useEffect(() => {
    if (paused) { applied.current = { at: query.dataUpdatedAt, data: query.data, identity }; return; }
    if (enabled && query.data && (query.dataUpdatedAt !== applied.current.at || query.data !== applied.current.data || identity !== applied.current.identity)) {
      applied.current = { at: query.dataUpdatedAt, data: query.data, identity };
      const result = preserveNfseObservation(snapshot, query.data);
      if (result !== snapshot) latest.current.onData(result);
    }
  }, [enabled, paused, query.data, query.dataUpdatedAt, snapshot, identity]);
  useEffect(() => {
    if (!enabled || paused || !pending && !query.isError || query.data && terminal(query.data.state)
      || failure.current.blocked || document.hidden || query.fetchStatus === 'fetching') return;
    const timer = window.setTimeout(() => refresh(), Math.max(3000, failure.current.nextAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [enabled, paused, pending, query.isError, query.fetchStatus, query.data, query.dataUpdatedAt, query.errorUpdatedAt, refresh]);
  const acceptUnsent = useCallback((result: T) => {
    // A structured pre-dispatch rejection can prove that the optimistic pending state never entered the ledger.
    void client.resetQueries({ queryKey, exact: true });
    client.setQueryData<T>(queryKey, result);
  }, [client, queryKey]);
  return { refresh, acceptUnsent };
}

interface Props {
  scope: NfseScope; attempt: IndividualAttempt | null; service: NfseIndividualService; paused: boolean;
  issue?: IndividualIssueResult; cancellation?: IndividualCancelResult;
  onIssue: (result: IndividualIssueResult) => void; onCancellation: (result: IndividualCancelResult) => void;
}
/** Browsers only observe durable backend state; the central worker owns fiscal GET requests. */
export function useNfseIndividualObservation({ scope, attempt, service, paused, issue, cancellation, onIssue, onCancellation }: Props) {
  const enabled = Boolean(attempt) && scope.environment === 'PRODUCAO';
  const initialCancelId = useRef(attempt?.cancelPreviewId);
  const issueRead = useSnapshot(nfseIndividualObservationKey(scope, attempt, 'issue'), issue,
    () => service.observe(scope, attempt!.requestId, attempt!.previewId), enabled, paused,
    !issue || issue.state === 'AWAITING_CONFIRMATION', onIssue);
  const cancelRead = useSnapshot(nfseIndividualObservationKey(scope, attempt, 'cancel'), cancellation,
    () => service.observeCancellation(scope, attempt!.requestId, attempt!.previewId, attempt!.cancelPreviewId!),
    enabled && Boolean(attempt?.cancelPreviewId), paused,
    !cancellation || ['CANCELLATION_PENDING', 'AWAITING_ANALYSIS'].includes(cancellation.state), onCancellation,
    Boolean(attempt?.cancelPreviewId && attempt.cancelPreviewId !== initialCancelId.current));
  const changed = useCallback(() => { issueRead.refresh(true); cancelRead.refresh(true); }, [issueRead.refresh, cancelRead.refresh]);
  useNfseOperationRealtime(scope, changed, enabled);
  return { acceptUnsentIssue: issueRead.acceptUnsent, acceptUnsentCancellation: cancelRead.acceptUnsent };
}
