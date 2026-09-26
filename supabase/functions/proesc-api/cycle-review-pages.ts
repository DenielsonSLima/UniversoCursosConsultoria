import { object, ProescError } from './contract.ts';
import { createProescV1Client } from './v1-client.ts';
import { cyclePageFresh, cyclePageHash, parseCycleSavedPages, projectCyclePage,
  type CycleEvidencePage } from './cycle-page-evidence.ts';

export class CycleCollectionPending extends ProescError {
  constructor() { super('A janela continua em conferência. A consulta será retomada.', 409); }
}
export type CycleCollectionStats = { sourceRequests: number; progressiveCount: number; sourceFailed: boolean };
export type CycleCollectionBudget = { deadlineAt: number; now: () => number };
export type CycleReviewReadOptions = {
  pages?: Map<string, Promise<CycleEvidencePage>>; signal?: AbortSignal;
  stats?: CycleCollectionStats; budget?: CycleCollectionBudget;
};
export const cycleCollectionBudget = (): CycleCollectionBudget => ({ deadlineAt: Date.now() + 75_000, now: Date.now });
type PageRpc = (action: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

export async function collectCyclePages(
  context: { unitId: string; firstYear: number; lastYear: number; tokenRevision: string },
  lease: { cacheId: string; lease: string }, token: string, transport: typeof fetch,
  pageRpc: PageRpc, assertActive: () => void, options: CycleReviewReadOptions,
): Promise<CycleEvidencePage[]> {
  const budget = options.budget ?? cycleCollectionBudget();
  const stats = options.stats ?? { sourceRequests: 0, progressiveCount: 0, sourceFailed: false };
  const saved = parseCycleSavedPages(await pageRpc('read', lease), context, budget.now());
  assertActive();
  const stored = new Map(saved.map((page) => [`${page.year}:${page.month}`, page]));
  const client = createProescV1Client({ token, transport, signal: options.signal });
  const pages: CycleEvidencePage[] = [];
  for (let year = context.firstYear; year <= context.lastYear; year++) for (let month = 1; month <= 12; month++) {
    assertActive();
    let page = stored.get(`${year}:${month}`);
    if (page && !cyclePageFresh(page, budget.now())) page = undefined;
    if (!page) {
      if (budget.now() >= budget.deadlineAt) throw new CycleCollectionPending();
      const key = `${context.tokenRevision}:${context.unitId}:${year}:${month}`;
      let pending = options.pages?.get(key);
      if (pending) {
        page = await pending;
        assertActive();
        if (!cyclePageFresh(page, budget.now())) { pending = undefined; page = undefined; }
      }
      if (!pending) {
        const observedAt = new Date(budget.now()).toISOString();
        pending = (async (): Promise<CycleEvidencePage> => {
          stats.sourceRequests++;
          try {
            const source = await client.accountingData({ unitId: context.unitId, year, month });
            const rows = await projectCyclePage(source);
            assertActive();
            return { unitId: context.unitId, year, month, observedAt, rows, hash: '' };
          } catch (error) { stats.sourceFailed = true; throw error; }
        })();
        // Rejected promises remain in this execution: a failed source is never
        // retried through another enrollment or silently replaced with [] rows.
        options.pages?.set(key, pending);
        page = await pending;
      }
      assertActive();
      if (!page || !cyclePageFresh(page, budget.now())) throw new CycleCollectionPending();
      const result = object(await pageRpc('append', { ...lease, year, month,
        observedAt: page.observedAt, rows: page.rows }));
      if (typeof result.saved !== 'boolean' || typeof result.reused !== 'boolean'
        || result.saved === result.reused || !cyclePageHash(result.hash)) {
        throw new ProescError('Não foi possível preservar a página conferida. Confira novamente.', 409);
      }
      if (result.saved) stats.progressiveCount++;
      assertActive();
      page = { ...page, hash: result.hash };
    }
    pages.push(page);
  }
  assertActive();
  // Time spent collecting cannot renew older observations. SQL checks the same
  // oldest-page timestamp and hashes atomically before completing the cache.
  if (pages.some((page) => !cyclePageFresh(page, budget.now()))) throw new CycleCollectionPending();
  return pages;
}
