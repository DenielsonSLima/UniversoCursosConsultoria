import { normalizeRecord } from './contract.ts';
import { resolveInvoiceObservation } from './invoice-observation.ts';
import { observeLinkedObligation, sha256, type SyncLink } from './sync-observation.ts';
import { parseProescV1Accounting } from './v1-accounting.ts';

const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const now = new Date('2026-09-22T12:00:00Z');
async function fixture() {
  const link: SyncLink = { linkId: 'local-link', receivableId: 'local-receivable', classId: 'local-class',
    unitId: '1', sourceClassId: '2', externalKey: '3', personHash: await sha256('12345678901'),
    dueDate: '2026-07-15', principalCents: 27990, status: 'PENDENTE', paidCents: 0,
    paymentDate: null, expectedBefore: 'fingerprint' };
  const page = parseProescV1Accounting({ status: 'success', data: [{ id: 1, chave_id: 3,
    unidade_id: 1, turma_id: 2, aluno_cpf: '12345678901', data_vencimento: link.dueDate,
    valor: '279.90', registro_cancelado: false, pagamento_renegociacao: false }] }, { unitId: '1', year: 2026, month: 7 });
  const observation = await observeLinkedObligation(link, page.rows, now);
  const invoice = { invoice_id: 3, person_id: 4, pessoa: { id: 4, cadastro_nacional: '123.456.789-01' },
    matricula: { id: 5, turma_id: 2 }, due_date: link.dueDate, original_invoice_amount: '279.90',
    paid_invoice_amount: '0.00', payment_date: null, status: 'VENCIDO' };
  return { link, observation, invoice };
}

Deno.test('V1 sem pagamento + V2 vencida com identidade comprovada produz OPEN sem baixa', async () => {
  const f = await fixture();
  const result = await resolveInvoiceObservation(f.link, f.observation, [normalizeRecord('invoices', f.invoice)], 'revision');
  assert(result.kind === 'observed'); if (result.kind !== 'observed') return;
  assert(result.observation.sourceStatus === 'OPEN' && result.observation.verification === 'VERIFIED');
  assert(result.observation.receivedCents === null && result.observation.paymentDate === null);
  assert(result.observation.evidenceKind === 'API_OPEN_OBLIGATION');
  assert(result.observation.openEvidence?.basis === 'EXPLICIT_SOURCE_STATUS');
  assert(!JSON.stringify(result.observation).includes('12345678901'));
});

Deno.test('a vencer e vencida são OPEN; a data de corte continua sendo decisão do Caixa', async () => {
  const f = await fixture();
  for (const status of ['EM ABERTO', 'VENCIDO']) {
    const result = await resolveInvoiceObservation(f.link, f.observation, [{ ...f.invoice, status }], 'revision');
    assert(result.kind === 'observed' && result.observation.sourceStatus === 'OPEN');
  }
});

Deno.test('paga, parcial, negociada, desconhecida ou estado acadêmico não viram dívida aberta', async () => {
  const f = await fixture();
  for (const status of ['PAGA', 'PAGA EM LOTE', 'PAGAMENTO PARCIAL', 'PAGAMENTO SUPERIOR', 'NEGOCIADA', 'ATIVA', 'OPEN', '']) {
    const result = await resolveInvoiceObservation(f.link, f.observation, [{ ...f.invoice, status }], 'revision');
    assert(result.kind === 'observed' && result.observation.verification === 'REVIEW', status);
  }
});

Deno.test('ausência da parcela não comprova aberto e não produz novo snapshot', async () => {
  const f = await fixture();
  const result = await resolveInvoiceObservation(f.link, f.observation, [], 'revision');
  assert(result.kind === 'unavailable' && result.reason === 'NOT_FOUND');
});

Deno.test('identidade, vencimento, valor, duplicidade e pagamento contraditório bloqueiam OPEN', async () => {
  const f = await fixture();
  const changes = [
    { person_id: 9 }, { pessoa: { id: 4, cadastro_nacional: '98765432100' } },
    { matricula: { id: 5, turma_id: 8 } }, { due_date: '2026-07-16' },
    { original_invoice_amount: '280.00' }, { paid_invoice_amount: '10.00' },
    { paid_invoice_amount: undefined }, { payment_date: '2026-07-10' },
    { payment_date: undefined }, { discounts: { paid_invoice_amount: '1.00' } },
    { discounts: { payment_date: '2026-07-10' } },
    { payment_date: {} }, { discounts: { payment_date: [] } },
  ];
  for (const change of changes) {
    const result = await resolveInvoiceObservation(f.link, f.observation,
      [normalizeRecord('invoices', { ...f.invoice, ...change })], 'revision');
    assert(result.kind === 'observed' && result.observation.verification === 'REVIEW', JSON.stringify(change));
  }
  const duplicate = await resolveInvoiceObservation(f.link, f.observation, [f.invoice, f.invoice], 'revision');
  assert(duplicate.kind === 'observed' && duplicate.observation.verification === 'REVIEW');
});

Deno.test('pagamento local confirmado não é reaberto por declaração V2 aberta', async () => {
  const f = await fixture();
  const result = await resolveInvoiceObservation({ ...f.link, status: 'PAGO', paidCents: 26000,
    paymentDate: '2026-07-10' }, f.observation, [f.invoice], 'revision');
  assert(result.kind === 'observed' && result.observation.verification === 'REVIEW');
  const canceled = await resolveInvoiceObservation({ ...f.link, status: 'CANCELADO' },
    f.observation, [f.invoice], 'revision');
  assert(canceled.kind === 'observed' && canceled.observation.verification === 'REVIEW');
});

Deno.test('prova é determinística e muda quando a revisão V2 muda', async () => {
  const f = await fixture();
  const a = await resolveInvoiceObservation(f.link, f.observation, [f.invoice], 'revision1');
  const b = await resolveInvoiceObservation(f.link, { ...f.observation, observedAt: '2026-09-22T12:01:00Z' }, [f.invoice], 'revision1');
  const c = await resolveInvoiceObservation(f.link, f.observation, [f.invoice], 'revision2');
  assert(a.kind === 'observed' && b.kind === 'observed' && c.kind === 'observed');
  if (a.kind !== 'observed' || b.kind !== 'observed' || c.kind !== 'observed') return;
  assert(a.observation.sourceFingerprint === b.observation.sourceFingerprint);
  assert(a.observation.sourceFingerprint !== c.observation.sourceFingerprint);
});
