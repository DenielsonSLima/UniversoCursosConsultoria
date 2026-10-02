import { object, ProescError } from './contract.ts';
import { readProescV2InvoicePage } from './v2-invoices.ts';
import { readProescV2PeoplePage } from './v2-people.ts';

type Reply = { data?: unknown; error?: unknown };
type RpcCall = PromiseLike<Reply> & { abortSignal?: (signal: AbortSignal) => PromiseLike<Reply> };
export type V2WorkerAdmin = { rpc(name: string, args: Record<string, unknown>): RpcCall };
type Options = { deadlineMs?: number; maxSteps?: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function documentHash(document: string | null) {
  if (document === null) return null;
  if (!/^\d{11}$/.test(document)) throw new ProescError('Identidade Proesc V2 inválida.', 502);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(document)))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Lease and durable pagination live in SQL; no V1 transport or financial math. */
export async function runProescV2Sync(
  admin: V2WorkerAdmin, actorId: string, transport: typeof fetch = fetch, options: Options = {},
) {
  const controller = new AbortController();
  const deadlineMs = Math.min(95000, Math.max(1, options.deadlineMs ?? 90000));
  const maxSteps = Math.min(20, Math.max(1, options.maxSteps ?? 20));
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const counts = { version: 'v2', claimed: false, pages: 0, records: 0, applyBatches: 0, failed: 0 };
  let active: Record<string, unknown> | null = null;
  let phase: 'claim' | 'credential' | 'read' | 'commit' | 'apply' = 'claim';
  const rpc = async (name: string, args: Record<string, unknown>, signal = controller.signal) => {
    if (signal.aborted) throw new ProescError('Prazo da coleta Proesc V2 encerrado.', 504);
    const call = admin.rpc(name, args);
    let onAbort: () => void = () => undefined;
    const canceled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new ProescError('Prazo da coleta Proesc V2 encerrado.', 504));
      signal.addEventListener('abort', onAbort, { once: true });
      // An RPC implementation may abort synchronously while creating the call.
      if (signal.aborted) onAbort();
    });
    try {
      const result = await Promise.race([Promise.resolve(
        typeof call.abortSignal === 'function' ? call.abortSignal(signal) : call), canceled]);
      if (result.error) throw new ProescError('Não foi possível preservar a consulta Proesc V2.', 409);
      return object(result.data);
    } finally { signal.removeEventListener('abort', onAbort); }
  };
  const runtime = (action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal) =>
    rpc('proesc_v2_runtime_service', { p_action: action, p_actor_id: actorId, p_payload: payload }, signal);
  const credential = () => rpc('proesc_connection_service', {
    p_action: 'credential', p_actor_id: actorId, p_payload: { version: 'v2' },
  });
  try {
    for (let step = 0; step < maxSteps && !controller.signal.aborted; step++) {
      phase = 'claim';
      const task = await runtime('claim');
      if (task.claimed !== true) break;
      active = task;
      counts.claimed = true;
      if (![task.taskId, task.leaseId, task.credentialRevision].every((value) =>
        typeof value === 'string' && uuid.test(value))) throw new ProescError('Lote Proesc V2 inválido.', 409);
      const lease = { taskId: task.taskId, leaseId: task.leaseId, credentialRevision: task.credentialRevision };
      if (task.resource === 'apply') {
        phase = 'apply';
        const applied = await runtime('apply', lease);
        if (applied.applied !== true && typeof applied.applied !== 'number') {
          throw new ProescError('Aplicação Proesc V2 não confirmada.', 409);
        }
        active = null;
        counts.applyBatches++;
        continue;
      }
      if (!['people', 'invoices'].includes(String(task.resource))
        || typeof task.unitId !== 'string' || !/^\d{1,16}$/.test(task.unitId)
        || !Number.isSafeInteger(task.page) || Number(task.page) < 1) {
        throw new ProescError('Página Proesc V2 inválida.', 409);
      }
      phase = 'credential';
      const saved = await credential();
      if (typeof saved.token !== 'string' || saved.revision !== task.credentialRevision
        || (saved.wafHeader !== null && saved.wafHeader !== undefined && typeof saved.wafHeader !== 'string')) {
        throw new ProescError('A conexão Proesc V2 mudou durante a coleta.', 409);
      }
      const readOptions = { token: saved.token, wafHeader: typeof saved.wafHeader === 'string'
        ? saved.wafHeader : undefined, unitId: task.unitId, page: Number(task.page),
        transport, signal: controller.signal };
      phase = 'read';
      const page = task.resource === 'people'
        ? await readProescV2PeoplePage({ ...readOptions, limit: 50 })
        : await readProescV2InvoicePage({ ...readOptions, year: Number(task.year), month: Number(task.month) });
      const records = await Promise.all(page.records.map(async ({ studentDocument, ...record }) => ({
        ...record, personHash: await documentHash(studentDocument),
      })));
      phase = 'credential';
      const current = await credential();
      if (current.revision !== saved.revision || current.token !== saved.token || current.wafHeader !== saved.wafHeader) {
        throw new ProescError('A conexão Proesc V2 mudou durante a coleta.', 409);
      }
      phase = 'commit';
      const committed = await runtime('commit', { ...lease, page: page.currentPage,
        lastPage: page.lastPage, total: page.total, observedAt: new Date().toISOString(), records });
      if (committed.committed !== true) throw new ProescError('Página Proesc V2 não confirmada.', 409);
      active = null;
      counts.pages++;
      counts.records += records.length;
    }
  } catch (error) {
    counts.failed++;
    if (active) {
      const release = new AbortController();
      const releaseTimer = setTimeout(() => release.abort(), 5000);
      const errorCode = error instanceof ProescError && error.status === 429 ? 'RATE_LIMIT'
        : controller.signal.aborted || error instanceof ProescError && error.status === 504 ? 'TIMEOUT'
        : error instanceof ProescError && error.status === 409
          ? phase === 'credential' ? 'CREDENTIAL_CHANGED'
            : phase === 'apply' ? 'APPLY_REJECTED'
            : phase === 'commit' ? 'COMMIT_REJECTED' : 'INVALID_RESPONSE'
          : 'INVALID_RESPONSE';
      try {
        await runtime('fail', { taskId: active.taskId, leaseId: active.leaseId,
          credentialRevision: active.credentialRevision, errorCode }, release.signal).catch(() => undefined);
      } finally { clearTimeout(releaseTimer); }
    }
  } finally { clearTimeout(timer); controller.abort(); }
  return counts;
}
