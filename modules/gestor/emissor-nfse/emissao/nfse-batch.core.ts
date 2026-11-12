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
export interface NfseBatchSnapshot { items: readonly NfseBatchItem[]; busy: boolean; phase: 'IDLE' | 'REVIEW' | 'ISSUE' | 'CONSULT' | 'CONFIRM'; paused: boolean }
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
  let snapshot: NfseBatchSnapshot = { items, busy, phase, paused };
  const listeners = new Set<() => void>();
  const emit = () => { snapshot = { items, busy, phase, paused }; if (!disposed) for (const listener of listeners) listener(); };
  const patch = (index: number, value: Partial<NfseBatchItem>) => { items = items.map((item, position) => position === index ? { ...item, ...value } : item); emit(); };
  const notice = (value: NfseFiscalNotice) => { if (!disposed) options.onNotice?.(value); };
  const changed = () => { sourceChanged = true; };
  const persist = (item: NfseBatchItem, previewId: string) => storage.setItem(batchSourceStorageKey(captured, item.source), JSON.stringify({ requestId: item.requestId, previewId }));
  const run = async (nextPhase: NfseBatchSnapshot['phase'], action: () => Promise<void>) => {
    if (busy || disposed || captured.environment !== 'PRODUCAO') return;
    busy = true; phase = nextPhase; stopped = false; paused = false; emit();
    try { await action(); } finally {
      busy = false; phase = 'IDLE'; emit();
      if (sourceChanged && !disposed) options.onChanged?.();
      sourceChanged = false;
    }
  };
  let wake: (() => void) | undefined;
  let signaled = false;
  let cancelRead: (() => void) | undefined;
  let lastEventRead = 0;
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
  };
  const read = async (index: number, timeoutMs = options.requestTimeoutMs ?? 45_000) => {
    const item = items[index]; if (!item.previewId) return;
    let pending = reads.get(index);
    if (!pending) {
      lastEventRead = Date.now();
      // Keep the physical request single-flight even after its UI deadline. Consume late
      // success/rejection exactly once; never start overlapping reads on a focus storm.
      pending = service.reconcile(captured, item.requestId, item.previewId)
        .then(result => { accept(index, result); })
        .finally(() => { reads.delete(index); lastEventRead = Date.now(); });
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
  return {
    signalChange() {
      if (disposed || stopped) return;
      if (busy) { signaled = true; wake?.(); return; }
      if (Date.now() - lastEventRead < 10_000 || !items.some(item => item.uncertain)) return;
      lastEventRead = Date.now();
      void run('CONSULT', async () => {
        for (let index = 0; index < items.length && !disposed && !stopped; index++) {
          if (!items[index].uncertain) continue;
          try { await read(index); } catch { /* Retain uncertainty; focus or a later event can recover. */ }
        }
      });
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate() { disposed = false; },
    dispose() { disposed = true; stopped = true; wake?.(); cancelRead?.(); },
    stop() { stopped = true; paused = true; wake?.(); cancelRead?.(); emit(); },
    async review(competenceDate?: string) { await run('REVIEW', async () => {
      for (let index = 0; index < items.length && !disposed && !stopped; index++) {
        const item = items[index];
        try {
          if (item.previewId) {
            await read(index);
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
    async issue() { await run('ISSUE', async () => {
      if (items.some(item => item.uncertain)) { paused = true; return; }
      for (let index = 0; index < items.length && !disposed && !stopped; index++) {
        const item = items[index]; if (!batchCanIssue(item) || !item.previewId) continue;
        try { persist(item, item.previewId); }
        catch {
          const message = 'Não foi possível preservar os identificadores. O envio desta nota não foi iniciado.';
          patch(index, { error: message }); paused = true;
          notice({ type: 'error', title: 'Envio não iniciado', message }); break;
        }
        try {
          // Persist the same operation before dispatch; uncertain responses are GET-only.
          phase = 'ISSUE';
          patch(index, { dispatched: true, result: undefined, error: undefined, preview: undefined });
          await bounded(service.issue(captured, item.requestId, item.previewId).then(result => { accept(index, result); }));
          if (items[index].uncertain) await follow(index);
          const final = items[index].result!;
          notice(individualIssueNotice(final));
          if (final.state !== 'AUTHORIZED') { paused = true; break; }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Resultado não confirmado. Consulte a mesma operação.';
          patch(index, { uncertain: true, dispatched: true, error: message }); paused = true;
          await follow(index);
          if (!items[index].uncertain && items[index].result) { notice(individualIssueNotice(items[index].result!)); break; }
          notice({ type: 'error', title: 'Lote pausado: resultado não confirmado', message }); break;
        }
      }
    }); },
  };
}
