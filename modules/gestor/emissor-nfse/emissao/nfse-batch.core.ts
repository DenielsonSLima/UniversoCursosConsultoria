import type { NfseScope } from '../types/nfse.types';
import type { IndividualIssueResult, IndividualPreview, NfseIndividualService } from '../individual/nfse-individual.types';
import { individualStorageKey, readIndividualAttempt } from '../individual/nfse-individual.attempt';
import { emissionSource, type NfseEmissionSource, type NfseOperationReference } from './nfse-operation.contract';
import { individualIssueNotice, type NfseFiscalNotice } from './nfse-fiscal-notice';
export interface NfseBatchInput { source: NfseEmissionSource; label: string; amount: string; operation?: NfseOperationReference }
export interface NfseBatchItem extends NfseBatchInput {
  requestId: string; previewId: string | null; preview?: IndividualPreview; result?: IndividualIssueResult;
  dispatched: boolean; uncertain: boolean; error?: string;
}
export interface NfseBatchSnapshot { items: readonly NfseBatchItem[]; busy: boolean; phase: 'IDLE' | 'REVIEW' | 'ISSUE' | 'CONSULT' | 'CONFIRM'; paused: boolean; monitoringPaused: boolean; retryAt: number | null }
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const batchSourceStorageKey = (scope: NfseScope, source: NfseEmissionSource) => `${individualStorageKey(scope)}:${source.kind}:${source.id}`;
export const batchCanIssue = (item: NfseBatchItem, now = Date.now()) => Boolean(!item.dispatched && !item.uncertain && !item.error
  && item.preview?.capability.available && item.preview.payload && Date.parse(item.preview.expiresAt) > now
  && (!item.result || item.result.state === 'PREVIEWED'));
/** Browser orchestrates single durable operations. No money, model or person is reconstructed here. */
export function createNfseBatchController(scope: NfseScope, input: readonly NfseBatchInput[], service: NfseIndividualService,
  storage: Storage, options: { uuid?: () => string; onChanged?: () => void; onNotice?: (notice: NfseFiscalNotice) => void; confirmationDelays?: readonly number[]; requestTimeoutMs?: number; confirmationTimeoutMs?: number } = {}) {
  if (!input.length || input.length > 100 || new Set(input.map(item => `${item.source.kind}:${item.source.id}`)).size !== input.length) throw new Error('Selecione preparações distintas para o lote.');
  const captured = { ...scope }, uuid = options.uuid || (() => crypto.randomUUID());
  let items: NfseBatchItem[] = input.map(item => {
    const source = emissionSource(item.source), saved = readIndividualAttempt(storage, batchSourceStorageKey(captured, source));
    return { ...item, source, requestId: item.operation?.requestId || saved?.requestId || uuid(),
      previewId: item.operation?.operationId || saved?.previewId || null, dispatched: false, uncertain: false };
  });
  let busy = false, phase: NfseBatchSnapshot['phase'] = 'IDLE', paused = false, stopped = false, disposed = false, sourceChanged = false;
  let explicitlyStopped = false;
  let dispatchIntent: ReadonlyMap<number, string> | null = null;
  let retryAt: number | null = null, retryTimer: ReturnType<typeof setTimeout> | undefined;
  const clearRetry = () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = undefined; retryAt = null; };
  let flushSignals: () => void = () => {};
  let snapshot: NfseBatchSnapshot = { items, busy, phase, paused, monitoringPaused: explicitlyStopped, retryAt };
  const listeners = new Set<() => void>();
  const emit = () => { snapshot = { items, busy, phase, paused, monitoringPaused: explicitlyStopped, retryAt }; if (!disposed) for (const listener of listeners) listener(); };
  const patch = (index: number, value: Partial<NfseBatchItem>) => { items = items.map((item, position) => position === index ? { ...item, ...value } : item); emit(); };
  const notice = (value: NfseFiscalNotice) => { if (!disposed) options.onNotice?.(value); };
  const changed = () => { sourceChanged = true; };
  const persist = (item: NfseBatchItem, previewId: string) => storage.setItem(batchSourceStorageKey(captured, item.source), JSON.stringify({ requestId: item.requestId, previewId }));
  const run = async (nextPhase: NfseBatchSnapshot['phase'], action: () => Promise<void>, automatic = false) => {
    if (busy || disposed || captured.environment !== 'PRODUCAO' || automatic && stopped) return;
    busy = true; phase = nextPhase;
    if (!automatic) { stopped = false; explicitlyStopped = false; paused = false; }
    emit();
    try { await action(); } finally {
      busy = false; phase = 'IDLE'; emit();
      if (sourceChanged && !disposed) options.onChanged?.();
      sourceChanged = false;
      flushSignals();
    }
  };
  let wake: (() => void) | undefined;
  let signaled = false;
  let cancelRead: (() => void) | undefined;
  let lastEventRead = 0;
  let signalTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSignal = false, immediateSignal = false;
  const clearSignals = () => {
    if (signalTimer) clearTimeout(signalTimer);
    signalTimer = undefined; pendingSignal = false; immediateSignal = false;
  };
  const bounded = <T,>(promise: Promise<T>, timeoutMs = options.requestTimeoutMs ?? 45_000): Promise<T> => new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); if (cancelRead === cancel) cancelRead = undefined; };
    const cancel = () => { finish(); reject(new Error('Retorno ainda não confirmado. O sistema consultará a mesma DPS, sem reenviar.')); };
    const timer = setTimeout(cancel, Math.max(0, timeoutMs));
    cancelRead = cancel;
    promise.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
  });
  const wait = (milliseconds: number) => new Promise<void>(resolve => {
    const timer = setTimeout(done, signaled ? 0 : milliseconds);
    signaled = false;
    function done() { clearTimeout(timer); wake = undefined; resolve(); }
    wake = done;
  });
  const reads = new Map<number, Promise<void>>();
  let wakeRead: { index: number; done: () => void } | undefined;
  const accept = (index: number, result: IndividualIssueResult) => {
    // A delayed uncertain response must never downgrade an authorization already observed.
    if (items[index].result?.state === 'AUTHORIZED' && result.state !== 'AUTHORIZED') return;
    if (items[index].dispatched && result.state === 'PREVIEWED') return;
    const preview = result.state === 'PREVIEWED' && result.expiresAt && result.capability ? { previewId: result.previewId, expiresAt: result.expiresAt,
      state: 'PREVIEWED' as const, capability: result.capability, payload: result.payload } : undefined;
    patch(index, { result, preview, error: undefined, uncertain: result.state === 'AWAITING_CONFIRMATION', dispatched: result.state !== 'PREVIEWED' });
    if (result.state === 'AUTHORIZED') {
      // A late POST may confirm while GET is still physically pending. Release only
      // this item's local waiter, retaining the GET single-flight until settlement.
      if (wakeRead?.index === index) wakeRead.done();
      wake?.();
    }
    if (busy) changed();
    else if (!disposed) options.onChanged?.();
    flushSignals();
  };
  const read = async (index: number, timeoutMs = options.requestTimeoutMs ?? 45_000, observe = true) => {
    const item = items[index]; if (!item.previewId) return;
    let pending = reads.get(index);
    if (!pending) {
      lastEventRead = Date.now();
      // Keep the physical request single-flight even after its UI deadline. Consume late
      // success/rejection exactly once; never start overlapping reads on a focus storm.
      const readState = observe ? service.observe : service.reconcile;
      if (!readState) throw new Error('A observação canônica desta operação está indisponível. Nenhuma consulta fiscal foi iniciada.');
      pending = readState(captured, item.requestId, item.previewId)
        .then(result => { accept(index, result); })
        .finally(() => { reads.delete(index); lastEventRead = Date.now(); flushSignals(); });
      reads.set(index, pending);
    }
    let waiter: { index: number; done: () => void } | undefined;
    const confirmed = new Promise<void>((resolve, reject) => {
      waiter = { index, done: resolve }; wakeRead = waiter;
      pending!.then(resolve, reject);
    });
    try { await bounded(confirmed, timeoutMs); }
    finally { if (wakeRead === waiter) wakeRead = undefined; }
  };
  // Bounded GET-only recovery while the explicit batch action is active, never a second ISSUE.
  const follow = async (index: number) => {
    phase = 'CONFIRM'; emit();
    const deadline = Date.now() + (options.confirmationTimeoutMs ?? 32_000);
    for (const delay of options.confirmationDelays || [1500, 2500, 4000, 6000, 8000, 10000]) {
      if (disposed || stopped || !items[index].uncertain) return;
      if (Date.now() >= deadline) return;
      await wait(Math.min(delay, deadline - Date.now()));
      if (disposed || stopped || !items[index].uncertain || Date.now() >= deadline) return;
      try { await read(index, Math.min(options.requestTimeoutMs ?? 45_000, deadline - Date.now())); } catch { continue; }
      if (!items[index].uncertain) return;
    }
  };
  const dispatchApproved = async (automatic = false) => {
    const approved = dispatchIntent;
    if (!approved) return;
    await run('ISSUE', async () => {
      paused = false; emit();
      for (const [index, previewId] of approved) {
        if (disposed || stopped || dispatchIntent !== approved) break;
        const item = items[index];
        if (item.dispatched && item.result?.state === 'AUTHORIZED') continue;
        if (item.uncertain) { paused = true; break; }
        if (item.previewId !== previewId || !batchCanIssue(item)) { dispatchIntent = null; paused = true; break; }
        try { persist(item, previewId); }
        catch {
          const message = 'Não foi possível preservar os identificadores. O envio desta nota não foi iniciado.';
          patch(index, { error: message }); dispatchIntent = null; paused = true;
          notice({ type: 'error', title: 'Envio não iniciado', message }); break;
        }
        try {
          phase = 'ISSUE';
          patch(index, { dispatched: true, result: undefined, error: undefined, preview: undefined });
          await bounded(service.issue(captured, item.requestId, previewId).then(result => { accept(index, result); }));
        } catch (error) {
          const limited = error as { code?: string; status?: number; beforeDispatch?: boolean; retryAfterMs?: number };
          if (limited.code === 'RATE_LIMITED' && limited.status === 429 && limited.beforeDispatch === true && items[index].result?.state !== 'AUTHORIZED') {
            const delay = Math.max(60_000, Number.isFinite(limited.retryAfterMs) ? limited.retryAfterMs! : 0);
            retryAt = Date.now() + delay; paused = true;
            patch(index, { dispatched: false, uncertain: false, preview: item.preview, result: item.result, error: undefined });
            notice({ type: 'error', title: 'Aguardando limite do emissor',
              message: 'Nenhum envio foi iniciado. A mesma nota será enviada automaticamente após o prazo informado, se a prévia continuar válida.' });
            break;
          }
          const message = error instanceof Error ? error.message : 'Resultado não confirmado. O acompanhamento continuará automaticamente.';
          if (items[index].result?.state !== 'AUTHORIZED') patch(index, { uncertain: true, dispatched: true, error: message });
        }
        if (items[index].uncertain) await follow(index);
        const final = items[index].result;
        if (!items[index].uncertain && final) {
          notice(individualIssueNotice(final));
          if (final.state === 'AUTHORIZED') continue;
          dispatchIntent = null;
        } else notice({ type: 'error', title: 'Envio pausado: aguardando confirmação', message: items[index].error || 'O acompanhamento continuará automaticamente, sem reenviar esta nota.' });
        paused = true; break;
      }
      if (dispatchIntent === approved && [...approved.keys()].every(index => items[index].result?.state === 'AUTHORIZED')) {
        dispatchIntent = null; paused = false;
      }
    }, automatic);
  };
  flushSignals = () => {
    if (disposed || stopped || busy) return;
    if (dispatchIntent && ![...dispatchIntent.keys()].some(index => items[index].uncertain)) {
      if (retryAt && retryAt > Date.now()) {
        if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = undefined; flushSignals(); }, retryAt - Date.now());
        return;
      }
      clearRetry();
      clearSignals(); void dispatchApproved(true); return;
    }
    if (!pendingSignal) return;
    if (!items.some(item => item.uncertain)) { clearSignals(); return; }
    // An event received during a physical read must be observed again after it
    // settles: that response may predate the event. Never overlap the same read.
    if (reads.size) return;
    const delay = immediateSignal ? 0 : Math.max(0, lastEventRead + 10_000 - Date.now());
    if (signalTimer) { clearTimeout(signalTimer); signalTimer = undefined; }
    if (delay) { signalTimer = setTimeout(() => { signalTimer = undefined; flushSignals(); }, delay); return; }
    pendingSignal = false; immediateSignal = false;
    void run('CONSULT', async () => {
      for (let index = 0; index < items.length && !disposed && !stopped; index++) {
        if (!items[index].uncertain) continue;
        try { await read(index); } catch { /* Keep the canonical state uncertain until a later hint. */ }
      }
    }, true);
  };
  return {
    signalChange(immediate = false) {
      if (disposed || stopped) return;
      pendingSignal = true; immediateSignal ||= immediate;
      if (busy) { signaled = true; wake?.(); return; }
      flushSignals();
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate() { disposed = false; stopped = explicitlyStopped; emit(); },
    dispose() { disposed = true; stopped = true; dispatchIntent = null; clearRetry(); clearSignals(); wake?.(); cancelRead?.(); },
    stop() { stopped = true; explicitlyStopped = true; paused = true; dispatchIntent = null; clearRetry(); clearSignals(); wake?.(); cancelRead?.(); emit(); },
    async review(competenceDate?: string) {
      if (busy || disposed) return;
      dispatchIntent = null; clearRetry();
      await run('REVIEW', async () => {
      for (let index = 0; index < items.length && !disposed && !stopped; index++) {
        const item = items[index];
        try {
          if (item.previewId) {
            await read(index, undefined, false);
            if (items[index].uncertain) await follow(index);
            if (disposed || stopped) break;
            const current = items[index];
            if (current.result?.state !== 'PREVIEWED' || current.uncertain || !current.preview ||
              (current.preview.capability.available && Date.parse(current.preview.expiresAt) > Date.now())) continue;
            const refreshed = await service.previewSource(captured, item.requestId, item.source,
              item.source.kind === 'PARTNER_SERVICE' ? current.preview.payload?.competenceDate : undefined);
            if (refreshed.previewId !== item.previewId) throw new Error('Atualização retornou outra operação fiscal. Consulte novamente.');
            patch(index, { preview: refreshed, error: undefined }); changed(); continue;
          }
          const preview = await service.previewSource(captured, item.requestId, item.source, item.source.kind === 'PARTNER_SERVICE' ? competenceDate : undefined);
          changed();
          persist(item, preview.previewId);
          patch(index, { preview, previewId: preview.previewId, error: undefined, uncertain: false, dispatched: false }); changed();
        } catch (error) { patch(index, { error: error instanceof Error ? error.message : 'Revisão não confirmada.' }); }
      }
    }); },
    async consult(index: number) { await run('CONSULT', async () => {
      try { await read(index); if (items[index].uncertain) await follow(index); }
      catch (error) { patch(index, { error: error instanceof Error ? error.message : 'Consulta não confirmada.' }); }
    }); },
    async issue() {
      if (busy || disposed || captured.environment !== 'PRODUCAO' || items.some(item => item.uncertain) || retryAt && retryAt > Date.now()) return;
      // This click approves only the current canonical previews in this modal.
      // No reopening, refresh or observation can create or expand this intent.
      dispatchIntent = new Map(items.flatMap((item, index) => batchCanIssue(item) && item.previewId ? [[index, item.previewId] as const] : []));
      if (!dispatchIntent.size) { dispatchIntent = null; return; }
      await dispatchApproved();
    },
  };
}
