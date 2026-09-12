import type { ProescV1AccountingRow } from './v1-accounting.ts';

export type SyncLink = {
  linkId: string; classId: string; unitId: string; sourceClassId: string;
  externalKey: string; receivableId: string; personHash: string;
  dueDate: string; principalCents: number; status: string;
  paidCents: number; paymentDate: string | null; expectedBefore: string;
};

export const sha256 = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

// O mês seleciona observações. Ausência de pagamento nunca reabre uma cobrança.
export async function observeLinkedObligation(
  link: SyncLink, observedRows: ProescV1AccountingRow[], now: Date,
) {
  const rows = observedRows.filter((row) => row.externalKey === link.externalKey
    && row.identity.unitId === link.unitId);
  const issues = new Set<string>();
  for (const row of rows) {
    if (row.identity.classId !== link.sourceClassId || row.dueDate !== link.dueDate
      || !row.identity.studentDocument
      || await sha256(row.identity.studentDocument) !== link.personHash) issues.add('IDENTITY_REQUIRES_REVIEW');
    if (row.cancelled !== false || row.renegotiationPayment !== false) issues.add('SOURCE_STATE_REQUIRES_REVIEW');
    if (row.blockId === '2' && row.paymentDate?.slice(0, 7)
      !== `${row.source.year}-${String(row.source.month).padStart(2, '0')}`) issues.add('PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD');
  }
  const principal = rows.filter((row) => row.blockId === '1');
  const payments = rows.filter((row) => row.blockId === '2');
  if (principal.length !== 1 || principal[0].amountCents !== link.principalCents) issues.add('PRINCIPAL_REQUIRES_REVIEW');
  if (!payments.length) issues.add('NO_PAYMENT_IN_OBSERVED_PERIODS');
  const dates = new Set(payments.map((row) => row.paymentDate));
  if (dates.size > 1) issues.add('PAYMENTS_ON_MULTIPLE_DATES_REQUIRE_REVIEW');
  const receivedCents = payments.reduce((sum, row) => sum + row.amountCents, 0);
  if (!Number.isSafeInteger(receivedCents)) issues.add('PAYMENT_AMOUNT_EXCEEDS_SAFE_RANGE');
  const payment = payments.length && dates.size === 1
    ? { amountCents: receivedCents, paymentDate: payments[0].paymentDate } : null;
  if (payment && (!payment.paymentDate || payment.paymentDate > now.toISOString().slice(0, 10)
    || payment.amountCents <= 0)) issues.add('PAYMENT_REQUIRES_REVIEW');
  // O total do Proesc é autoritativo, inclusive pagamentos divididos em várias
  // formas/parcelas. Não deduplicar linhas iguais nem inferir descontos do saldo.
  const lines = rows.map((row) => ({
    blockCode: row.blockId, amountCents: row.amountCents, paymentDate: row.paymentDate,
    cancelled: row.cancelled === true, paymentMethod: row.paymentMethod,
    renegotiation: row.renegotiationPayment === true,
    sourceYear: row.source.year, sourceMonth: row.source.month,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const reviewReasons = [...issues].sort();
  const verified = reviewReasons.length === 0;
  const value = {
    linkId: link.linkId, principalCents: link.principalCents,
    receivedCents: payment?.amountCents ?? null, paymentDate: payment?.paymentDate ?? null,
    sourceStatus: rows.some((row) => row.cancelled) ? 'CANCELED' : payment ? 'PAID' : 'UNKNOWN',
    verification: verified ? 'VERIFIED' : 'REVIEW',
    evidenceKind: verified ? 'API_PAYMENT_TOTAL' : 'UNRESOLVED',
    components: { interestCents: null, penaltyCents: null, discountCents: null, additionCents: null },
    lines, reviewReasons,
  };
  // Mantém multiplicidade, mas não depende de CPF, nome ou posição na resposta mensal.
  return { ...value, observedAt: now.toISOString(), sourceFingerprint: await sha256(JSON.stringify(value)) };
}
