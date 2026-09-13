import { object, ProescError } from './contract.ts';
import { createProescV1Client } from './v1-client.ts';
import type { ProescV1AccountingPage, ProescV1AccountingSource } from './v1-accounting.ts';
import { cycleSourceObligations } from './cycle-schedule-source.ts';

export type CycleReviewAdmin = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export type CycleReviewReadOptions = {
  pages?: Map<string, Promise<ProescV1AccountingPage>>;
  observedAt?: string;
  signal?: AbortSignal;
};
// Requests sharing a worker wait on the same unit/window fetch. Database leases
// also prevent duplicate fan-out across separate Edge workers.
const inFlight = new Map<string, Promise<void>>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ensureProescCycleCache(
  admin: CycleReviewAdmin, actorId: string, matriculaId: unknown, transport = fetch,
  options: CycleReviewReadOptions = {},
) {
  if (typeof matriculaId !== 'string' || !uuid.test(matriculaId)) throw new ProescError('Matrícula inválida.');
  const rpc = async (name: string, payload: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, payload);
    if (error) throw new ProescError('Não foi possível confirmar os ciclos. Atualize a tela e confira novamente.', 409);
    return object(data);
  };
  const cacheRpc = (action: string, payload = {}) => rpc('proesc_cycle_review_cache_service', {
    p_action: action, p_actor_id: actorId, p_matricula_id: matriculaId, p_payload: payload,
  });
  let start = await cacheRpc('begin');
  // A second request may arrive while the shared source collection is running.
  if (start.busy === true) {
    const pending = [...inFlight.values()];
    if (pending.length) {
      await Promise.allSettled(pending);
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
      const credential = await rpc('proesc_workspace_service', {
        p_action: 'token', p_actor_id: actorId, p_payload: {},
      });
      if (typeof credential.token !== 'string' || credential.revision !== start.tokenRevision) {
        throw new ProescError('A conexão Proesc mudou. Confira novamente.', 409);
      }
      const client = createProescV1Client({ token: credential.token, transport, signal: options.signal });
      const queries: ProescV1AccountingSource[] = [];
      for (let year = firstYear; year <= lastYear; year++) for (let month = 1; month <= 12; month++) {
        queries.push({ unitId: context.unitId as string, year, month });
      }
      const pages: ProescV1AccountingPage[] = new Array(queries.length);
      let next = 0;
      let failed = false;
      const workers = await Promise.allSettled(Array.from({ length: 4 }, async () => {
        while (!failed && next < queries.length) {
          const index = next++;
          try {
            const query = queries[index];
            const key = `${credential.revision}:${query.unitId}:${query.year}:${query.month}`;
            let pending = options.pages?.get(key);
            if (!pending) {
              pending = client.accountingData(query);
              options.pages?.set(key, pending);
            }
            pages[index] = await pending;
          }
          catch (error) { failed = true; throw error; }
        }
      }));
      const failure = workers.find((worker) => worker.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      const obligations = await cycleSourceObligations(pages, context.classIds as string[]);
      await cacheRpc('complete', {
        cacheId, lease: start.lease, obligations,
        ...(options.observedAt ? { sourceObservedAt: options.observedAt } : {}),
        periods: pages.map((page) => ({ year: page.source.year, month: page.source.month, complete: true })),
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
