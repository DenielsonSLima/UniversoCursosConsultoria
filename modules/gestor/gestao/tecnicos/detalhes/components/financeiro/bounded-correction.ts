export type CorrectionStatus = 'WAITING_BANK' | 'WAITING_CONSENT' | 'READY' | 'PARTIAL' | 'COMPLETE' | 'REVIEW';
export type CorrectionSummary = {
  operationId: string; matriculaId: string; status: CorrectionStatus; fingerprint: string;
  firstDueDate: string; installmentCount: 12; activeTotal: string;
  historicalCycle2Count: 0 | 13; localFeeDisposition: 'WAIVED' | 'PRESERVED_PAID' | 'PENDING';
};
export type CorrectionTerms = {
  nominalAmount: number; dueDate: string;
  discount: { type: 'fixed'; value: number; validUntil: string };
  penalty: { type: 'percentage'; value: number; startsOn: string };
  interest: { type: 'monthly-percentage'; value: number; startsOn: string };
};
export type CorrectionPreview = CorrectionSummary & {
  installments: Array<{ id: string; key: string; value: string; dueDate: string; financialTerms: CorrectionTerms }>;
  consent: { consented: boolean; requestId: string | null };
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const fail = (): never => { throw new Error('A correção financeira não foi confirmada pelo servidor. Atualize a lista.'); };
export const parseCorrectionSummary = (v: unknown): CorrectionSummary => {
  if (!record(v) || !uuid.test(String(v.operationId)) || !uuid.test(String(v.matriculaId))
    || !['WAITING_BANK', 'WAITING_CONSENT', 'READY', 'PARTIAL', 'COMPLETE', 'REVIEW'].includes(String(v.status))
    || !/^[0-9a-f]{64}$/.test(String(v.fingerprint)) || !date(v.firstDueDate)
    || v.installmentCount !== 12 || v.activeTotal !== '3358.80'
    || ![0, 13].includes(Number(v.historicalCycle2Count)) || typeof v.historicalCycle2Count !== 'number'
    || !['WAIVED', 'PRESERVED_PAID', 'PENDING'].includes(String(v.localFeeDisposition))) return fail();
  return v as unknown as CorrectionSummary;
};
export const parseCorrectionPreview = (v: unknown): CorrectionPreview => {
  const summary = parseCorrectionSummary(v);
  if (!record(v) || !Array.isArray(v.installments) || v.installments.length !== 12
    || !record(v.consent) || typeof v.consent.consented !== 'boolean'
    || (v.consent.consented ? !uuid.test(String(v.consent.requestId)) : v.consent.requestId !== null)) return fail();
  const ids = new Set(), keys = new Set();
  for (const item of v.installments) {
    if (!record(item) || !uuid.test(String(item.id)) || typeof item.key !== 'string'
      || !/^ciclo-1-parc-\d+$/.test(item.key) || item.value !== '279.90' || !date(item.dueDate)
      || ids.has(item.id) || keys.has(item.key)) return fail();
    ids.add(item.id); keys.add(item.key);
    const t = item.financialTerms;
    if (!record(t) || t.nominalAmount !== 279.9 || t.dueDate !== item.dueDate
      || !record(t.discount) || t.discount.type !== 'fixed' || t.discount.value !== 19.9 || !date(t.discount.validUntil)
      || !record(t.penalty) || t.penalty.type !== 'percentage' || t.penalty.value !== 2 || !date(t.penalty.startsOn)
      || !record(t.interest) || t.interest.type !== 'monthly-percentage' || t.interest.value !== 1 || !date(t.interest.startsOn)) return fail();
  }
  if (v.installments[0].dueDate !== summary.firstDueDate) return fail();
  return v as unknown as CorrectionPreview;
};
export const correctionLabels: Record<CorrectionStatus, string> = {
  WAITING_BANK: 'Aguardando cancelamento bancário confirmado',
  WAITING_CONSENT: '1º ciclo corrigido aguardando sua confirmação',
  READY: '1º ciclo corrigido disponível para emissão manual',
  PARTIAL: '1º ciclo corrigido com emissão parcial',
  COMPLETE: '1º ciclo corrigido emitido', REVIEW: 'Correção em revisão; emissão bloqueada',
};
export const canReviewCorrection = (c: CorrectionSummary) =>
  ['WAITING_CONSENT', 'READY', 'PARTIAL'].includes(c.status) && c.localFeeDisposition !== 'PENDING';

// Completion restores only the original canonical cycle path; it never grants eligibility.
export const usesCanonicalCycleAfterCorrection = (c: CorrectionSummary | null | undefined) =>
  c?.status === 'COMPLETE' && c.historicalCycle2Count === 0;
