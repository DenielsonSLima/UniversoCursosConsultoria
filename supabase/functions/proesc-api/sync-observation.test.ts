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
Deno.test('ausência no recorte não indica estorno; identidade diferente e cópia entre meses exigem revisão', async () => {
  const current = await link();
  const absent = await observeLinkedObligation(current, [row('1', 27990, 1)], now);
  assert(absent.sourceStatus === 'UNKNOWN' && absent.receivedCents === null);
  const copy = await observeLinkedObligation(current, [row('1', 27990, 1), row('2', 27990, 8), row('2', 27990, 9)], now);
  assert(copy.verification === 'REVIEW' && copy.reviewReasons.includes('PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD'));
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
