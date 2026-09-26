import { object, ProescError } from './contract.ts';
import { cycleEvidenceObligations } from './cycle-schedule-source.ts';
import { collectCyclePages, type CycleReviewReadOptions } from './cycle-review-pages.ts';
export type { CycleReviewReadOptions } from './cycle-review-pages.ts';

export type CycleReviewAdmin = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
// Requests sharing a worker wait on the same unit/window fetch. Database leases
// also prevent duplicate fan-out across separate Edge workers.
const inFlight = new Map<string, Promise<void>>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ensureProescCycleCache(
  admin: CycleReviewAdmin, actorId: string, matriculaId: unknown, transport = fetch,
  options: CycleReviewReadOptions = {},
) {
  if (typeof matriculaId !== 'string' || !uuid.test(matriculaId)) throw new ProescError('Matrícula inválida.');
  const assertActive = () => {
    if (options.signal?.aborted) throw new ProescError('A consulta automática será retomada.', 409);
  };
  const rpc = async (name: string, payload: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, payload);
    if (error) throw new ProescError('Não foi possível confirmar os ciclos. Atualize a tela e confira novamente.', 409);
    return object(data);
  };
  const cacheRpc = (action: string, payload = {}) => rpc('proesc_cycle_review_cache_service', {
    p_action: action, p_actor_id: actorId, p_matricula_id: matriculaId, p_payload: payload,
  });
  assertActive();
  let start = await cacheRpc('begin');
  // A second request may arrive while the shared source collection is running.
  if (start.busy === true) {
    const pending = [...inFlight.values()];
    if (pending.length) {
      const waiting = Promise.allSettled(pending);
      const signal = options.signal;
      if (signal) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            signal.removeEventListener('abort', abort);
            reject(new ProescError('A consulta automática será retomada.', 409));
          };
          signal.addEventListener('abort', abort, { once: true });
          waiting.then(() => { signal.removeEventListener('abort', abort); resolve(); });
          if (signal.aborted) abort();
        });
      } else await waiting;
      assertActive();
      start = await cacheRpc('begin');
    }
    if (start.busy === true) throw new ProescError('A conferência desta janela está em andamento. Aguarde alguns instantes e tente novamente.', 409);
  }
  if (typeof start.cacheId !== 'string' || !uuid.test(start.cacheId)) throw new ProescError('Conferência inválida.', 409);
  const cacheId = start.cacheId;
  if (start.cached !== true) {
    const context = object(start.context);
    const firstYear = Number(context.firstYear), lastYear = Number(context.lastYear);
    if (typeof context.unitId !== 'string' || !/^\d+$/.test(context.unitId)
      || !Number.isInteger(firstYear) || !Number.isInteger(lastYear) || firstYear < 2000
      || lastYear < firstYear || lastYear > firstYear + 5 || !Array.isArray(context.classIds)
      || context.classIds.some((id) => typeof id !== 'string' || !/^\d+$/.test(id))
      || typeof start.lease !== 'string' || !uuid.test(start.lease)) throw new ProescError('Janela de conferência inválida.', 409);
    const run = async () => {
      assertActive();
      const credential = await rpc('proesc_workspace_service', {
        p_action: 'token', p_actor_id: actorId, p_payload: {},
      });
      if (typeof credential.token !== 'string' || credential.revision !== start.tokenRevision) {
        throw new ProescError('A conexão Proesc mudou. Confira novamente.', 409);
      }
      assertActive();
      if (typeof credential.revision !== 'string') throw new ProescError('Conexão Proesc inválida.', 409);
      const pageRpc = (action: string, payload: Record<string, unknown>) => rpc('proesc_cycle_review_pages_service', {
        p_action: action, p_actor_id: actorId, p_matricula_id: matriculaId, p_payload: payload,
      });
      const pages = await collectCyclePages({ unitId: context.unitId as string, firstYear, lastYear,
        tokenRevision: credential.revision }, { cacheId, lease: start.lease as string },
        credential.token, transport, pageRpc, assertActive, options);
      const obligations = cycleEvidenceObligations(pages, context.classIds as string[]);
      assertActive();
      await cacheRpc('complete', {
        cacheId, lease: start.lease, obligations, resumeVersion: 1,
        sourceObservedAt: new Date(Math.min(...pages.map((page) => Date.parse(page.observedAt)))).toISOString(),
        periods: pages.map((page) => ({ year: page.year, month: page.month, complete: true })),
        pageHashes: pages.map((page) => ({ year: page.year, month: page.month, hash: page.hash })),
      });
    };
    const promise = run();
    inFlight.set(cacheId, promise);
    try { await promise; }
    catch (error) {
      await cacheRpc('abort', { cacheId, lease: start.lease }).catch(() => undefined);
      throw error;
    } finally { inFlight.delete(cacheId); }
  }
  assertActive();
  return cacheId;
}

export async function reviewProescCycles(admin: CycleReviewAdmin, actorId: string, matriculaId: unknown, transport = fetch) {
  const cacheId = await ensureProescCycleCache(admin, actorId, matriculaId, transport);
  const { data, error } = await admin.rpc('proesc_record_api_cycle_review_service', {
    p_actor_id: actorId, p_matricula_id: matriculaId, p_cache_id: cacheId,
  });
  if (error) throw new ProescError('Não foi possível confirmar os ciclos. Atualize a tela e confira novamente.', 409);
  return object(data);
}
