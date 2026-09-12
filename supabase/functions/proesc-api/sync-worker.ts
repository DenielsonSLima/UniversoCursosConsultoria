import { createProescV1Client } from './v1-client.ts';
import type { ProescV1AccountingRow } from './v1-accounting.ts';
import { observeLinkedObligation, type SyncLink } from './sync-observation.ts';

type RpcResult = { data: unknown; error: unknown };
type RpcRequest = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
type RpcAdmin = { rpc(name: string, args: Record<string, unknown>): RpcRequest };
type Claim = { claimed: boolean; leaseId: string; lastId: string; links: SyncLink[] };
type Options = { deadlineMs?: number };

export async function runProescSync(
  admin: RpcAdmin, actorId: string, transport: typeof fetch = fetch,
  now = new Date(), options: Options = {},
) {
  const rpc = async (name: string, args: Record<string, unknown>, signal?: AbortSignal) => {
    if (signal?.aborted) throw new Error('Prazo da consulta encerrado.');
    const request = admin.rpc(name, args);
    return await (signal && request.abortSignal ? request.abortSignal(signal) : request);
  };
  const runtime = async (action: string, payload: object = {}) => {
    const { data, error } = await rpc('proesc_sync_runtime_service', {
      p_action: action, p_actor_id: actorId, p_payload: payload,
    });
    if (error) throw new Error('Consulta interna Proesc indisponível.');
    return data;
  };
  const claim = await runtime('claim') as Claim;
  if (!claim.claimed) return { claimed: false };
  const counts = { consulted: 0, applied: 0, unchanged: 0, review: 0, failed: 0 };
  const completed = Array<boolean>(Array.isArray(claim.links) ? claim.links.length : 0).fill(false);
  const controller = new AbortController();
  const deadlineMs = Math.min(95000, Math.max(1, options.deadlineMs ?? 95000));
  const deadline = setTimeout(() => controller.abort(), deadlineMs);
  try {
    if (!Array.isArray(claim.links) || claim.links.length < 1 || claim.links.length > 60
      || claim.links.at(-1)?.linkId !== claim.lastId) throw new Error('Lote de consulta inválido.');
    const credential = await rpc('proesc_workspace_service', {
      p_action: 'token', p_actor_id: actorId, p_payload: {},
    }, controller.signal);
    const saved = credential.data as { token?: string; revision?: string };
    if (credential.error || !saved?.token || !/^[0-9a-f]{32}$/i.test(saved.token)) {
      throw new Error('Credencial de consulta incompatível.');
    }
    const client = createProescV1Client({ token: saved.token, transport, signal: controller.signal, timeoutMs: 12000 });
    const periods = new Map<string, { unitId: string; year: number; month: number }>();
    const allowedKeys = new Set(claim.links.map((link) => `${link.unitId}:${link.externalKey}`));
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    for (const link of claim.links) {
      for (const date of [link.dueDate, link.paymentDate, now.toISOString(), previous.toISOString()]) {
        if (!date) continue;
        const [year, month] = date.slice(0, 7).split('-').map(Number);
        periods.set(`${link.unitId}:${year}:${month}`, { unitId: link.unitId, year, month });
      }
    }
    const allRows: ProescV1AccountingRow[] = [];
    const tasks = [...periods.values()];
    let readPosition = 0;
    const readers = Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (readPosition < tasks.length && !controller.signal.aborted) {
        const page = await client.accountingData(tasks[readPosition++]);
        allRows.push(...page.rows.filter((row) => allowedKeys.has(`${row.identity.unitId}:${row.externalKey}`)));
      }
    });
    try { await Promise.all(readers); }
    catch { controller.abort(); await Promise.allSettled(readers); throw new Error('Consulta mensal incompleta.'); }
    if (controller.signal.aborted) throw new Error('Prazo da consulta encerrado.');
    const currentCredential = await rpc('proesc_workspace_service', {
      p_action: 'token', p_actor_id: actorId, p_payload: {},
    }, controller.signal);
    if (currentCredential.error || (currentCredential.data as { revision?: string })?.revision !== saved.revision) {
      throw new Error('Credencial alterada durante a consulta.');
    }
    let writePosition = 0;
    let stopped = false;
    const processLink = async (link: SyncLink) => {
      const observation = await observeLinkedObligation(link, allRows, now);
      const snapshot = await rpc('proesc_record_financial_snapshot_service', {
        p_actor_id: actorId, p_request_id: crypto.randomUUID(), p_payload: observation,
      }, controller.signal);
      if (snapshot.error) throw new Error('Não foi possível registrar a conferência.');
      counts.consulted++;
      if (observation.verification !== 'VERIFIED') {
        if (observation.reviewReasons.length === 1
          && observation.reviewReasons[0] === 'NO_PAYMENT_IN_OBSERVED_PERIODS') counts.unchanged++;
        else counts.review++;
        return;
      }
      const snapshotId = (snapshot.data as { snapshotId?: string })?.snapshotId;
      if (!snapshotId) throw new Error('Resposta interna de conferência inválida.');
      const result = await rpc('proesc_apply_financial_snapshot_service', {
        p_actor_id: actorId, p_request_id: crypto.randomUUID(),
        p_payload: { snapshotId, expectedBefore: link.expectedBefore, mode: 'AUTO', syncLeaseId: claim.leaseId },
      }, controller.signal);
      if (result.error) {
        if (controller.signal.aborted) throw new Error('Prazo da consulta encerrado.');
        // The source observation is durable. CAS/guard failures stay in review
        // and are revisited on the next pass rather than starving later links.
        counts.review++;
        return;
      }
      const state = (result.data as { result?: string })?.result;
      if (state === 'APPLIED') counts.applied++;
      else if (state === 'UNCHANGED') counts.unchanged++;
      else counts.review++;
    };
    await Promise.all(Array.from({ length: Math.min(3, claim.links.length) }, async () => {
      while (writePosition < claim.links.length && !stopped && !controller.signal.aborted) {
        const index = writePosition++;
        try {
          await processLink(claim.links[index]);
          completed[index] = true;
        } catch {
          counts.failed++;
          stopped = true;
        }
      }
    }));
    if (controller.signal.aborted && counts.failed === 0) counts.failed++;
  } catch {
    counts.failed++;
  } finally { controller.abort(); clearTimeout(deadline); }
  let completedCount = 0;
  while (completedCount < completed.length && completed[completedCount]) completedCount++;
  // Concurrent later items may finish first. Advance only the contiguous prefix;
  // later completed items are safe to observe again under existing CAS/replay.
  await runtime('finish', {
    leaseId: claim.leaseId, lastId: claim.lastId,
    completedCount, completedLastId: completedCount ? claim.links[completedCount - 1].linkId : null,
    success: counts.failed === 0 && completedCount === claim.links.length, counts,
  });
  return { claimed: true, ...counts };
}
