import { object, type RecordValue } from './contract.ts';
import { proescV1MoneyCents } from './v1-accounting.ts';
import { sha256, type observeLinkedObligation, type SyncLink } from './sync-observation.ts';

type Observation = Awaited<ReturnType<typeof observeLinkedObligation>>;
export type InvoiceObservation = Observation & { openEvidence?: {
  basis: 'EXPLICIT_SOURCE_STATUS'; sourceManifestHash: string; providerStatus: 'OPEN'; sourceField: 'status';
} };
export type InvoiceResolution =
  | { kind: 'unavailable'; reason: 'NOT_FOUND' | 'INCOMPLETE' }
  | { kind: 'observed'; observation: InvoiceObservation };

const identifier = (value: unknown): string | null => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  return /^[1-9][0-9]{0,79}$/.test(text) ? text : null;
};
const cpf = (value: unknown): string | null => typeof value === 'string'
  && (/^\d{11}$/.test(value) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value))
  ? value.replace(/[.-]/g, '') : null;
const noDate = (value: unknown) => value === null || value === ''
  || value === '0000-00-00' || value === '00/00/0000';

export const needsInvoiceEvidence = (observation: Observation) => observation.verification === 'REVIEW'
  && observation.reviewReasons.length === 1 && observation.reviewReasons[0] === 'NO_PAYMENT_IN_OBSERVED_PERIODS';

/** Called only with a completely read unit/month and an unchanged V2 credential revision. */
export async function resolveInvoiceObservation(
  link: SyncLink, previous: Observation, invoices: RecordValue[], revision: string,
): Promise<InvoiceResolution> {
  if (!needsInvoiceEvidence(previous) || !revision) return { kind: 'unavailable', reason: 'INCOMPLETE' };
  const matches = invoices.filter((row) => identifier(row.invoice_id) === link.externalKey);
  if (!matches.length) return { kind: 'unavailable', reason: 'NOT_FOUND' };
  const review = async (reason: string): Promise<InvoiceResolution> => {
    const value = { ...previous, sourceStatus: 'UNKNOWN', verification: 'REVIEW', evidenceKind: 'UNRESOLVED',
      reviewReasons: [reason], sourceFingerprint: '' };
    value.sourceFingerprint = await sha256(JSON.stringify({ ...value, observedAt: undefined, sourceFingerprint: undefined }));
    return { kind: 'observed', observation: value };
  };
  // A repeated invoice ID is not silently deduplicated, even if the rows look equal.
  if (matches.length !== 1) return review('IDENTITY_REQUIRES_REVIEW');
  const row = matches[0]; const person = object(row.pessoa); const enrollment = object(row.matricula);
  const document = cpf(person.cadastro_nacional);
  const personId = identifier(row.person_id);
  if (!document || !personId || identifier(person.id) !== personId
    || identifier(enrollment.turma_id) !== link.sourceClassId
    || await sha256(document) !== link.personHash || row.due_date !== link.dueDate) {
    return review('IDENTITY_REQUIRES_REVIEW');
  }
  let principal: number; let paid: number;
  try {
    principal = proescV1MoneyCents(row.original_invoice_amount);
    paid = proescV1MoneyCents(row.paid_invoice_amount);
  } catch { return review('PRINCIPAL_REQUIRES_REVIEW'); }
  if (principal !== link.principalCents || principal <= 0) return review('PRINCIPAL_REQUIRES_REVIEW');
  // These are the explicit states published in the official invoices schema.
  // Academic status, absent receipts and missing fields never prove OPEN.
  if (!['EM ABERTO', 'VENCIDO'].includes(String(row.status)) || paid !== 0
    || !Object.hasOwn(row, 'payment_date') || !noDate(row.payment_date)
    || link.paidCents !== 0 || link.paymentDate !== null || !['PENDENTE', 'VENCIDO'].includes(link.status)) {
    return review('SOURCE_STATE_REQUIRES_REVIEW');
  }
  const discounts = object(row.discounts);
  if (Object.hasOwn(discounts, 'paid_invoice_amount')) {
    try { if (proescV1MoneyCents(discounts.paid_invoice_amount) !== paid) return review('PAYMENT_REQUIRES_REVIEW'); }
    catch { return review('PAYMENT_REQUIRES_REVIEW'); }
  }
  if (Object.hasOwn(discounts, 'payment_date') && !noDate(discounts.payment_date)) return review('PAYMENT_REQUIRES_REVIEW');
  const manifest = { version: 'v2', revision, unitId: link.unitId, invoiceId: link.externalKey,
    personId, personHash: link.personHash, classId: link.sourceClassId, dueDate: link.dueDate,
    principalCents: principal, paidCents: paid, providerStatus: row.status, paymentDate: null };
  const value: InvoiceObservation = { ...previous, sourceStatus: 'OPEN', verification: 'VERIFIED',
    evidenceKind: 'API_OPEN_OBLIGATION', receivedCents: null, paymentDate: null, reviewReasons: [],
    openEvidence: { basis: 'EXPLICIT_SOURCE_STATUS', sourceManifestHash: await sha256(JSON.stringify(manifest)),
      providerStatus: 'OPEN', sourceField: 'status' }, sourceFingerprint: '' };
  value.sourceFingerprint = await sha256(JSON.stringify({ ...value, observedAt: undefined, sourceFingerprint: undefined }));
  return { kind: 'observed', observation: value };
}
