import { object, ProescError } from './contract.ts';
import { ensureProescCycleCache, type CycleReviewAdmin } from './cycle-review.ts';
import type { ProescV1AccountingPage } from './v1-accounting.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const countKeys = ['reviewed', 'failed', 'c1', 'full', 'unknown', 'protected', 'eligible'] as const;

export async function reviewProescClassCycles(
  admin: CycleReviewAdmin, actorId: string, turmaId: unknown, transport = fetch,
  signal?: AbortSignal, workerLease?: string,
) {
  if (turmaId !== null && (typeof turmaId !== 'string' || !uuid.test(turmaId))) {
    throw new ProescError('Turma inválida.');
  }
  const rpc = async (action: string, payload = {}) => {
    if (signal?.aborted) throw new ProescError('A consulta automática será retomada.', 409);
    const { data, error } = await admin.rpc('proesc_cycle_review_batch_service', {
      p_action: action, p_actor_id: actorId, p_turma_id: turmaId, p_payload: payload,
    });
    if (error) throw new ProescError('Não foi possível concluir a consulta automática da turma.', 409);
    return object(data);
  };
  const target = await rpc('targets');
  if (!Array.isArray(target.groups) || target.groups.length > 20) throw new ProescError('Lote automático inválido.', 409);
  const counts = { reviewed: 0, failed: 0, c1: 0, full: 0, unknown: 0, protected: 0, eligible: 0 };
  const pages = new Map<string, Promise<ProescV1AccountingPage>>();
  const errors = new Set<string>();
  const observedAt = new Date().toISOString();
  for (const raw of target.groups) {
    const group = object(raw);
    if (typeof group.representativeId !== 'string' || !uuid.test(group.representativeId)
      || !Array.isArray(group.matriculaIds) || group.matriculaIds.length > 1000
      || group.matriculaIds.some((id) => typeof id !== 'string' || !uuid.test(id))) {
      throw new ProescError('Identidade do lote automático inválida.', 409);
    }
    const ids = group.matriculaIds as string[];
    let position = 0;
    try {
      const cacheId = await ensureProescCycleCache(admin, actorId, group.representativeId, transport,
        { pages, observedAt, signal });
      for (; position < ids.length; position += 20) {
        const result = await rpc('record', { cacheId, matriculaIds: ids.slice(position, position + 20),
          ...(workerLease ? { workerLease } : {}) });
        for (const key of countKeys) {
          const value = result[key];
          if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 20) {
            throw new ProescError('Resultado automático incompleto.', 409);
          }
          counts[key] += Number(value);
        }
      }
    } catch (error) {
      counts.failed += ids.length - position;
      errors.add(error instanceof ProescError ? error.message : 'A API não concluiu a janela de consulta.');
    }
  }
  return { success: counts.failed === 0, turmaId, ...counts, sourceRequests: pages.size,
    observedAt, errors: [...errors].slice(0,3),
    message: counts.failed > 0 ? 'Algumas matrículas aguardam a próxima consulta automática.' : null };
}

export async function runProescCycleReviewWorker(admin: CycleReviewAdmin, actorId: string, transport = fetch) {
  const runtime = async (action: string, payload = {}) => {
    const { data, error } = await admin.rpc('proesc_cycle_review_runtime_service', {
      p_action: action, p_actor_id: actorId, p_payload: payload,
    });
    if (error) throw new ProescError('Rotina automática Proesc indisponível.', 409);
    return object(data);
  };
  const claim = await runtime('claim');
  if (claim.claimed !== true) return { claimed: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 105000);
  let result: Record<string, unknown>;
  try { result = await reviewProescClassCycles(admin, actorId, null, transport, controller.signal,
    typeof claim.leaseId === 'string' ? claim.leaseId : undefined); }
  catch { result = { success: false, reviewed: 0, failed: 1, message: 'A consulta automática será retomada.' }; }
  finally { controller.abort(); clearTimeout(timer); }
  await runtime('finish', { leaseId: claim.leaseId, success: result.success === true, result });
  return { claimed: true, ...result };
}
