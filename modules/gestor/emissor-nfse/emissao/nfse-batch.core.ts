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
export interface NfseBatchSnapshot { items: readonly NfseBatchItem[]; busy: boolean; phase: 'IDLE' | 'REVIEW' | 'ISSUE' | 'CONSULT'; paused: boolean }
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const batchSourceStorageKey = (scope: NfseScope, source: NfseEmissionSource) => `${individualStorageKey(scope)}:${source.kind}:${source.id}`;
export const batchCanIssue = (item: NfseBatchItem, now = Date.now()) => Boolean(!item.dispatched && !item.uncertain && !item.error
  && item.preview?.capability.available && item.preview.payload && Date.parse(item.preview.expiresAt) > now
  && (!item.result || item.result.state === 'PREVIEWED'));
/** Browser orchestrates single durable operations. No money, model or person is reconstructed here. */
export function createNfseBatchController(scope: NfseScope, input: readonly NfseBatchInput[], service: NfseIndividualService,
  storage: Storage, options: { uuid?: () => string; onChanged?: () => void; onNotice?: (notice: NfseFiscalNotice) => void } = {}) {
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
  const read = async (index: number) => {
    const item = items[index]; if (!item.previewId) return;
    const result = await service.reconcile(captured, item.requestId, item.previewId);
    const preview = result.state === 'PREVIEWED' && result.expiresAt && result.capability ? { previewId: result.previewId, expiresAt: result.expiresAt,
      state: 'PREVIEWED' as const, capability: result.capability, payload: result.payload } : undefined;
    patch(index, { result, preview, error: undefined, uncertain: result.state === 'AWAITING_CONFIRMATION', dispatched: result.state !== 'PREVIEWED' });
    changed();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate() { disposed = false; },
    dispose() { disposed = true; stopped = true; },
    stop() { stopped = true; paused = true; emit(); },
    async review(competenceDate?: string) { await run('REVIEW', async () => {
      for (let index = 0; index < items.length && !disposed && !stopped; index++) {
        const item = items[index];
        try {
          if (item.previewId) { await read(index); continue; }
          const preview = await service.previewSource(captured, item.requestId, item.source, item.source.kind === 'PARTNER_SERVICE' ? competenceDate : undefined);
          changed();
          persist(item, preview.previewId);
          patch(index, { preview, previewId: preview.previewId, error: undefined, uncertain: false, dispatched: false }); changed();
        } catch (error) { patch(index, { error: error instanceof Error ? error.message : 'Revisão não confirmada.' }); }
      }
    }); },
    async consult(index: number) { await run('CONSULT', async () => {
      try { await read(index); }
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
          patch(index, { dispatched: true, error: undefined, preview: undefined });
          const result = await service.issue(captured, item.requestId, item.previewId);
          patch(index, { result, uncertain: result.state === 'AWAITING_CONFIRMATION' }); changed(); notice(individualIssueNotice(result));
          if (result.state !== 'AUTHORIZED') { paused = true; break; }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Resultado não confirmado. Consulte a mesma operação.';
          patch(index, { uncertain: true, dispatched: true, error: message }); paused = true;
          notice({ type: 'error', title: 'Lote pausado: resultado não confirmado', message }); break;
        }
      }
    }); },
  };
}
