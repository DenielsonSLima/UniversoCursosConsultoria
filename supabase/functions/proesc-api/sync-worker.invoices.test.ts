import { runProescSync } from './sync-worker.ts';
import { sha256 } from './sync-observation.ts';

const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const now = new Date('2026-09-22T12:00:00Z');
type Scenario = { v2Status?: number; invoiceStatus?: string; missing?: boolean; emptyV1?: boolean;
  rotateV2?: boolean; downgrade?: boolean; duplicate?: boolean };
async function fixture(scenario: Scenario = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let v2Reads = 0;
  const link = { linkId: 'link', classId: 'class', unitId: '1', sourceClassId: '2', externalKey: '3',
    receivableId: 'receipt', personHash: await sha256('12345678901'), dueDate: '2026-07-15',
    principalCents: 27990, status: 'PENDENTE', paidCents: 0, paymentDate: null, expectedBefore: 'hash' };
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'proesc_sync_runtime_service' && args.p_action === 'claim') return { error: null,
      data: { claimed: true, leaseId: 'lease', lastId: 'link', links: [link] } };
    if (name === 'proesc_workspace_service') return { error: null, data: { token: 'a'.repeat(32), revision: 'v1' } };
    if (name === 'proesc_connection_service') return { error: null, data: { token: 'synthetic-v2-token',
      revision: ++v2Reads > 1 && scenario.rotateV2 ? 'rotated' : 'v2' } };
    if (name === 'proesc_try_reuse_observation_service') return { error: null, data: { reused: false } };
    if (name === 'proesc_record_financial_snapshot_service') return { error: null,
      data: { snapshotId: 'new', verification: scenario.downgrade ? 'REVIEW' : 'VERIFIED' } };
    if (name === 'proesc_sync_runtime_service' && args.p_action === 'finish') {
      const payload = args.p_payload as { counts: { consulted: number }; telemetry: { items: Array<{ snapshotId: string | null }> } };
      assert(payload.counts.consulted === payload.telemetry.items.filter((item) => item.snapshotId !== null).length,
        'Ledger counts only persisted/reused snapshots as consulted');
    }
    return { error: null, data: {} };
  } };
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v1/')) return Response.json({ status: 'success', data:
      url.searchParams.get('mes') === '07' && !scenario.emptyV1 ? [{ id: 1, chave_id: 3,
        unidade_id: 1, turma_id: 2, aluno_cpf: '12345678901', data_vencimento: link.dueDate,
        valor: '279.90', registro_cancelado: false, pagamento_renegociacao: false }] : [] });
    if (scenario.v2Status) return new Response('untrusted provider body', { status: scenario.v2Status });
    const invoice = { invoice_id: 3, person_id: 4, pessoa: { id: 4, cadastro_nacional: '12345678901' },
      matricula: { id: 5, turma_id: 2 }, due_date: link.dueDate, original_invoice_amount: '279.90',
      paid_invoice_amount: '0.00', payment_date: null, status: scenario.invoiceStatus ?? 'VENCIDO' };
    return Response.json({ current_page: 1, last_page: 1,
      data: scenario.missing ? [] : scenario.duplicate ? [invoice, invoice] : [invoice] });
  };
  return { calls, admin, transport };
}

Deno.test('worker publica prova OPEN pela RPC canônica e não chama baixa AUTO', async () => {
  const f = await fixture(); const result = await runProescSync(f.admin, 'actor', f.transport, now);
  const snapshot = f.calls.find((call) => call.name === 'proesc_record_financial_snapshot_service');
  const value = snapshot?.args.p_payload as { sourceStatus: string; openEvidence: { providerStatus: string } };
  assert(value.sourceStatus === 'OPEN' && value.openEvidence.providerStatus === 'OPEN');
  assert('review' in result && result.review === 0 && result.unchanged === 1 && result.applied === 0);
  assert(!f.calls.some((call) => call.name === 'proesc_apply_financial_snapshot_service'));
});

Deno.test('falha V2, ausência da parcela, rotação ou V1 vazia preservam provas já gravadas', async () => {
  for (const scenario of [{ v2Status: 403 }, { v2Status: 503 }, { missing: true }, { rotateV2: true }, { emptyV1: true }]) {
    const f = await fixture(scenario); const result = await runProescSync(f.admin, 'actor', f.transport, now);
    assert('review' in result && result.review === 1 && result.unchanged === 0);
    assert(!f.calls.some((call) => ['proesc_record_financial_snapshot_service', 'proesc_apply_financial_snapshot_service'].includes(call.name)),
      'Uma consulta inconclusiva não pode substituir a prova anterior');
  }
});

Deno.test('conflito explícito invalida elegibilidade antiga, sem inventar quitação ou renegociação', async () => {
  for (const scenario of [{ invoiceStatus: 'PAGA' }, { invoiceStatus: 'NEGOCIADA' }, { duplicate: true }]) {
    const f = await fixture(scenario); const result = await runProescSync(f.admin, 'actor', f.transport, now);
    const value = f.calls.find((call) => call.name === 'proesc_record_financial_snapshot_service')?.args.p_payload as {
      verification: string; sourceStatus: string };
    assert(value.verification === 'REVIEW' && value.sourceStatus === 'UNKNOWN');
    assert('review' in result && result.review === 1 && result.applied === 0);
  }
});

Deno.test('a RPC pode rebaixar OPEN; o worker respeita a decisão canônica', async () => {
  const f = await fixture({ downgrade: true }); const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('review' in result && result.review === 1 && result.unchanged === 0);
});
