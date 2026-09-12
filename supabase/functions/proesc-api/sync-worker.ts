import { createProescV1Client } from './v1-client.ts';
import type { ProescV1AccountingRow } from './v1-accounting.ts';
import { observeLinkedObligation, type SyncLink } from './sync-observation.ts';

type RpcAdmin = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
type Claim = { claimed: boolean; leaseId: string; lastId: string; links: SyncLink[] };

export async function runProescSync(admin: RpcAdmin, actorId: string, transport: typeof fetch = fetch, now = new Date()) {
  const runtime = async (action: string, payload: object = {}) => {
    const { data, error } = await admin.rpc('proesc_sync_runtime_service', {
      p_action: action, p_actor_id: actorId, p_payload: payload,
    });
    if (error) throw new Error('Consulta interna Proesc indisponível.');
    return data;
  };
  const claim = await runtime('claim') as Claim;
  if (!claim.claimed) return { claimed: false };
  const counts = { consulted: 0, applied: 0, unchanged: 0, review: 0, failed: 0 };
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 95000);
  try {
    const credential = await admin.rpc('proesc_workspace_service', {
      p_action: 'token', p_actor_id: actorId, p_payload: {},
    });
    const saved = credential.data as { token?: string; revision?: string };
    if (credential.error || !saved?.token || !/^[0-9a-f]{32}$/i.test(saved.token)) throw new Error('Credencial de consulta incompatível.');
    const client = createProescV1Client({ token: saved.token, transport, signal: controller.signal, timeoutMs: 12000 });
    const periods = new Map<string, { unitId: string; year: number; month: number }>();
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
    let position = 0;
    const readers = Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (position < tasks.length && !controller.signal.aborted) {
        const page = await client.accountingData(tasks[position++]);
        // O provedor filtra por unidade/mês. Só preservamos os vínculos do lote autorizado.
        allRows.push(...page.rows.filter((row) => claim.links.some((link) =>
          row.identity.unitId === link.unitId && row.externalKey === link.externalKey)));
      }
    });
    try { await Promise.all(readers); }
    catch { controller.abort(); await Promise.allSettled(readers); throw new Error('Consulta mensal incompleta.'); }
    const currentCredential = await admin.rpc('proesc_workspace_service', {
      p_action: 'token', p_actor_id: actorId, p_payload: {},
    });
    if (currentCredential.error || (currentCredential.data as { revision?: string })?.revision !== saved.revision) {
      throw new Error('Credencial alterada durante a consulta.');
    }
    for (const link of claim.links) {
      if (controller.signal.aborted) throw new Error('Prazo da consulta encerrado.');
      const observation = await observeLinkedObligation(link, allRows, now);
      const snapshot = await admin.rpc('proesc_record_financial_snapshot_service', {
        p_actor_id: actorId, p_request_id: crypto.randomUUID(), p_payload: observation,
      });
      if (snapshot.error) throw new Error('Não foi possível registrar a conferência.');
      counts.consulted++;
      if (observation.verification !== 'VERIFIED') {
        if (observation.reviewReasons.length === 1
          && observation.reviewReasons[0] === 'NO_PAYMENT_IN_OBSERVED_PERIODS') counts.unchanged++;
        else counts.review++;
        continue;
      }
      const snapshotId = (snapshot.data as { snapshotId?: string })?.snapshotId;
      if (!snapshotId) throw new Error('Resposta interna de conferência inválida.');
      if (controller.signal.aborted) throw new Error('Prazo da consulta encerrado.');
      const result = await admin.rpc('proesc_apply_financial_snapshot_service', {
        p_actor_id: actorId, p_request_id: crypto.randomUUID(),
        p_payload: { snapshotId, expectedBefore: link.expectedBefore, mode: 'AUTO', syncLeaseId: claim.leaseId },
      });
      if (result.error) { counts.review++; continue; }
      const state = (result.data as { result?: string })?.result;
      if (state === 'APPLIED') counts.applied++;
      else if (state === 'UNCHANGED') counts.unchanged++;
      else counts.review++;
    }
  } catch {
    counts.failed++;
  } finally { controller.abort(); clearTimeout(deadline); }
  await runtime('finish', { leaseId: claim.leaseId, lastId: claim.lastId, success: counts.failed === 0, counts });
  // Nenhum token, CPF, corpo remoto ou identificador de aluno na resposta da Edge.
  return { claimed: true, ...counts };
}
