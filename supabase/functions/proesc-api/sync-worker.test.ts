import { runProescSync } from './sync-worker.ts';
import { sha256 } from './sync-observation.ts';

const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const now = new Date('2026-09-12T17:00:00Z');
const token = 'a'.repeat(32);
async function fixture() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const personHash = await sha256('12345678901');
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'proesc_sync_runtime_service' && args.p_action === 'claim') return { error: null, data: {
      claimed: true, leaseId: 'lease', lastId: 'link', links: [{ linkId: 'link', classId: 'local', unitId: '1',
        sourceClassId: '2', externalKey: '3', receivableId: 'receipt', personHash, dueDate: '2026-09-15',
        principalCents: 10000, status: 'PENDENTE', paidCents: 0, paymentDate: null, expectedBefore: 'hash' }],
    } };
    if (name === 'proesc_workspace_service') return { error: null, data: { token, revision: 'revision' } };
    if (name === 'proesc_record_financial_snapshot_service') return { error: null, data: { snapshotId: 'snapshot' } };
    if (name === 'proesc_apply_financial_snapshot_service') return { error: null, data: { result: 'APPLIED' } };
    return { error: null, data: { finished: true } };
  } };
  const transport: typeof fetch = (input) => {
    const month = new URL(String(input)).searchParams.get('mes');
    const common = { chave_id: '3', unidade_id: '1', turma_id: '2', aluno_cpf: '12345678901',
      data_vencimento: '2026-09-15', registro_cancelado: false, pagamento_renegociacao: false };
    return Promise.resolve(Response.json({ status: 'success', data: Number(month) === 9
      ? [{ ...common, id: 1, valor: '100.00', data_pagamento: null },
        { ...common, id: 2, valor: '50.00', data_pagamento: '2026-09-12' }] : [] }));
  };
  return { calls, admin, transport };
}

Deno.test('rotina consulta escopo confirmado, aplica total do Proesc com lease e responde sem dados pessoais', async () => {
  const f = await fixture(); const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('applied' in result && result.applied === 1 && result.failed === 0);
  const apply = f.calls.find((call) => call.name === 'proesc_apply_financial_snapshot_service');
  assert((apply?.args.p_payload as Record<string, unknown>)?.syncLeaseId === 'lease');
  const text = JSON.stringify(result); assert(!text.includes(token) && !text.includes('12345678901'));
});
Deno.test('erro de consulta não aplica pagamento nem avança o cursor', async () => {
  const f = await fixture(); const result = await runProescSync(f.admin, 'actor', () => Promise.resolve(new Response('', { status: 403 })), now);
  assert('failed' in result && result.failed === 1);
  assert(!f.calls.some((call) => call.name === 'proesc_apply_financial_snapshot_service'));
  const finish = f.calls.find((call) => call.args.p_action === 'finish');
  assert((finish?.args.p_payload as Record<string, unknown>)?.success === false);
});

Deno.test('telemetria separa GET mensal de obrigação e não inclui token, CPF ou corpo', async () => {
  const f = await fixture();
  await runProescSync(f.admin, 'actor', f.transport, now);
  const payload = f.calls.find((call) => call.args.p_action === 'finish')?.args.p_payload as Record<string, unknown>;
  const telemetry = payload.telemetry as { http: Array<{ httpStatus: number }>; items: Array<{ result: string }> };
  assert(telemetry.http.length === 2 && telemetry.items.length === 1);
  assert(telemetry.http.every((item) => item.httpStatus === 200) && telemetry.items[0].result === 'APPLIED');
  const serialized = JSON.stringify(telemetry);
  assert(!serialized.includes(token) && !serialized.includes('12345678901') && !serialized.includes('https://'));
});
Deno.test('403 fica HTTP_ERROR sanitizado e não simula obrigações consultadas', async () => {
  const f = await fixture();
  await runProescSync(f.admin, 'actor', () => Promise.resolve(new Response(`token=${token}`, { status: 403 })), now);
  const payload = f.calls.find((call) => call.args.p_action === 'finish')?.args.p_payload as Record<string, unknown>;
  const telemetry = payload.telemetry as { http: Array<{ httpStatus: number; errorCode: string }>; items: unknown[]; errorCode: string };
  assert(telemetry.errorCode === 'HTTP_ERROR' && telemetry.items.length === 0);
  assert(telemetry.http.some((row) => row.httpStatus === 403 && row.errorCode === 'HTTP_ERROR'));
  assert(!JSON.stringify(telemetry).includes(token));
});
Deno.test('erro bruto de transporte não entra no histórico de execução', async () => {
  const f = await fixture();
  await runProescSync(f.admin, 'actor', () => Promise.reject(new Error(`https://proesc.invalid/?token=${token}&cpf=12345678901`)), now);
  const payload = f.calls.find((call) => call.args.p_action === 'finish')?.args.p_payload as Record<string, unknown>;
  assert((payload.telemetry as { errorCode: string }).errorCode === 'TRANSPORT_ERROR');
  assert(!JSON.stringify(payload.telemetry).includes(token) && !JSON.stringify(payload.telemetry).includes('12345678901'));
});
Deno.test('200 sem prova financeira registra REVIEW, sem classificar como falha HTTP', async () => {
  const f = await fixture();
  await runProescSync(f.admin, 'actor', () => Promise.resolve(Response.json({ status: 'success', data: [] })), now);
  const payload = f.calls.find((call) => call.args.p_action === 'finish')?.args.p_payload as Record<string, unknown>;
  const telemetry = payload.telemetry as { http: Array<{ errorCode: string | null }>; items: Array<{ result: string }>; errorCode: string | null };
  assert(telemetry.http.every((row) => row.errorCode === null));
  assert(telemetry.items[0].result === 'REVIEW' && telemetry.errorCode === null);
});
