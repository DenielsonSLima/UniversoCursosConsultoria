import { observeLinkedObligation, sha256, type SyncLink } from './sync-observation.ts';
import type { ProescV1AccountingRow } from './v1-accounting.ts';

const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const now = new Date('2026-09-12T17:00:00Z');
const link = async (): Promise<SyncLink> => ({ linkId: 'link', classId: 'local-class', unitId: '1',
  sourceClassId: '2', externalKey: '3', receivableId: 'receipt', personHash: await sha256('12345678901'),
  dueDate: '2026-01-15', principalCents: 27990, status: 'PENDENTE', paidCents: 0,
  paymentDate: null, expectedBefore: 'before' });
const row = (blockId: string, amountCents: number, month: number): ProescV1AccountingRow => ({
  externalKey: '3', blockId, amountCents,
  identity: { unitId: '1', classId: '2', courseId: null, studentDocument: '12345678901' },
  dueDate: '2026-01-15', paymentDate: blockId === '2' ? '2026-09-12' : null,
  createdDate: null, paymentMethod: '3', cancelled: false, renegotiationPayment: false,
  competenceYear: null, competenceMonth: null, source: { unitId: '1', year: 2026, month, rowIndex: 0 }, issues: [],
});

Deno.test('soma as dez parcelas contábeis, preservando multiplicidade e vencimento antigo', async () => {
  const result = await observeLinkedObligation(await link(), [row('1', 27990, 1),
    ...Array.from({ length: 10 }, () => row('2', 2799, 9))], now);
  assert(result.verification === 'VERIFIED' && result.receivedCents === 27990);
  assert(result.evidenceKind === 'API_PAYMENT_TOTAL' && result.lines.length === 11);
  assert(!JSON.stringify(result).includes('12345678901'));
});
Deno.test('pagamento parcial segue o Proesc sem fabricar desconto ou respeitar valor local antigo', async () => {
  const current = { ...await link(), status: 'PAGO', paidCents: 22990, paymentDate: '2026-09-12' };
  const result = await observeLinkedObligation(current, [row('1', 27990, 1), row('2', 5000, 9)], now);
  assert(result.verification === 'VERIFIED' && result.receivedCents === 5000);
  assert(result.components.discountCents === null && result.principalCents === 27990);
});
Deno.test('preserva juros e multa explícitos da mesma liquidação sem completar componentes ausentes', async () => {
  const charge = (block: string, amount: number) => ({ ...row(block, amount, 9), paymentDate: '2026-09-12' });
  const result = await observeLinkedObligation(await link(), [row('1', 27990, 1),
    row('2', 28558, 9), charge('3', 9), charge('4', 559), charge('7', 250)], now);
  assert(result.verification === 'VERIFIED' && result.receivedCents === 28558);
  assert(result.components.interestCents === 9 && result.components.penaltyCents === 559);
  assert(result.components.discountCents === null && result.components.additionCents === null);
});
Deno.test('ausência, repetição ou data divergente dos encargos não vira zero nem soma presumida', async () => {
  const current = await link();
  const interest = { ...row('3', 9, 9), paymentDate: '2026-09-12' };
  for (const charges of [[], [interest, interest], [{ ...interest, paymentDate: '2026-09-11' }]]) {
    const result = await observeLinkedObligation(current, [row('1', 27990, 1), row('2', 26000, 9), ...charges], now);
    assert(result.components.interestCents === null && result.components.penaltyCents === null);
    assert(result.components.discountCents === null && result.verification === 'VERIFIED');
  }
});
Deno.test('ausência no recorte não indica estorno; identidade diferente e cópia entre meses exigem revisão', async () => {
  const current = await link();
  const absent = await observeLinkedObligation(current, [row('1', 27990, 1)], now);
  assert(absent.sourceStatus === 'UNKNOWN' && absent.receivedCents === null);
  const copy = await observeLinkedObligation(current, [row('1', 27990, 1), row('2', 27990, 8), row('2', 27990, 9)], now);
  assert(copy.verification === 'REVIEW' && copy.reviewReasons.includes('PAYMENT_OBSERVED_IN_MULTIPLE_PERIODS'));
  assert(copy.receivedCents === null && copy.sourceStatus === 'UNKNOWN');
  assert(copy.lines.length === 3, 'Cópias permanecem na prova para revisão');
  const wrong = row('2', 27990, 9); wrong.identity.classId = '99';
  assert((await observeLinkedObligation(current, [row('1', 27990, 1), wrong], now)).verification === 'REVIEW');
});
Deno.test('ordem da resposta não muda fingerprint, mas a quantidade de recebimentos muda', async () => {
  const current = await link(); const rows = [row('1', 27990, 1), row('2', 20000, 9), row('2', 6000, 9)];
  const a = await observeLinkedObligation(current, rows, now);
  const b = await observeLinkedObligation(current, [...rows].reverse(), now);
  const c = await observeLinkedObligation(current, [...rows, row('2', 6000, 9)], now);
  assert(a.sourceFingerprint === b.sourceFingerprint && a.sourceFingerprint !== c.sourceFingerprint);
  assert(a.receivedCents === 26000 && a.verification === 'VERIFIED');
});

Deno.test('uma resposta mantém pagamento fora do mês ou ano consultado sem deslocar a data', async () => {
  const current = await link();
  for (const paymentDate of ['2026-09-12', '2025-12-31']) {
    const payment = { ...row('2', 26000, 1), paymentDate };
    const result = await observeLinkedObligation(current, [row('1', 27990, 1), payment], now);
    assert(result.verification === 'VERIFIED' && result.receivedCents === 26000);
    assert(result.paymentDate === paymentDate && result.evidenceKind === 'API_PAYMENT_TOTAL');
    assert(result.lines.some((line) => line.sourceMonth === 1 && line.paymentDate === paymentDate));
  }
});
Deno.test('splits iguais dentro da resposta fora do mês mantêm multiplicidade', async () => {
  const result = await observeLinkedObligation(await link(), [row('1', 27990, 1),
    ...Array.from({ length: 10 }, () => row('2', 2799, 1))], now);
  assert(result.verification === 'VERIFIED' && result.receivedCents === 27990);
  assert(result.lines.length === 11 && result.paymentDate === '2026-09-12');
});
Deno.test('conjuntos divergentes entre meses ou anos não produzem total escolhido ou somado', async () => {
  const current = await link();
  for (const extra of [row('2', 6000, 8),
    { ...row('2', 26000, 9), source: { ...row('2', 26000, 9).source, year: 2025 } }]) {
    const result = await observeLinkedObligation(current,
      [row('1', 27990, 1), row('2', 26000, 9), extra], now);
    assert(result.verification === 'REVIEW' && result.evidenceKind === 'UNRESOLVED');
    assert(result.reviewReasons.includes('PAYMENT_OBSERVED_IN_MULTIPLE_PERIODS'));
    assert(result.receivedCents === null && result.paymentDate === null && result.lines.length === 3);
  }
});
Deno.test('datas conflitantes, futuras, ausentes e flags de origem continuam em revisão', async () => {
  const current = await link();
  for (const payment of [
    { ...row('2', 26000, 1), paymentDate: null },
    { ...row('2', 26000, 1), paymentDate: '2027-01-01' },
    { ...row('2', 26000, 1), cancelled: true },
    { ...row('2', 26000, 1), renegotiationPayment: true },
  ]) {
    const result = await observeLinkedObligation(current, [row('1', 27990, 1), payment], now);
    assert(result.verification === 'REVIEW' && result.evidenceKind === 'UNRESOLVED');
  }
  const dates = await observeLinkedObligation(current, [row('1', 27990, 1), row('2', 20000, 1),
    { ...row('2', 6000, 1), paymentDate: '2026-08-31' }], now);
  assert(dates.verification === 'REVIEW' && dates.receivedCents === null);
  assert(dates.reviewReasons.includes('PAYMENTS_ON_MULTIPLE_DATES_REQUIRE_REVIEW'));
  const absent = await observeLinkedObligation(current, [], now);
  assert(absent.sourceStatus === 'UNKNOWN' && absent.receivedCents === null
    && absent.verification === 'REVIEW');
});
