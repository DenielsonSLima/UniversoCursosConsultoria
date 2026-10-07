import { DATABASE_UUID_RE, FINGERPRINT_RE, REQUEST_UUID_RE, IssuanceHttpError, parseCycleContext,
  type ManualCycleContext, type ManualCycleIssuanceRequest } from './contract.ts';
import type { IssuanceScope } from './receivable-issuance.ts';
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const fail = (): never => { throw new IssuanceHttpError(409,
  'A correção exige prévia atual e consentimento do usuário autenticado.', 'CORRECTION_CONSENT_REQUIRED'); };
export type BoundedCorrectionContext = {
  operationId: string; fingerprint: string; consentRequestId: string;
  authorizationRequestIds: Record<string, string>;
};
export const parseBoundedCorrectionContext = (
  value: unknown, request: ManualCycleIssuanceRequest, scope: IssuanceScope,
): ManualCycleContext => {
  if (!record(value) || request.action !== 'resume' || request.cicloNumero !== 1
    || value.operationId !== request.correctionOperationId || value.matriculaId !== request.matriculaId
    || value.matriculaId !== scope.matriculaId || !DATABASE_UUID_RE.test(String(value.operationId))
    || !FINGERPRINT_RE.test(String(value.fingerprint)) || !['READY', 'PARTIAL', 'COMPLETE'].includes(String(value.status))
    || value.installmentCount !== 12 || value.activeTotal !== '3358.80' || value.firstDueDate !== '2026-10-15'
    || !['WAIVED', 'PRESERVED_PAID'].includes(String(value.localFeeDisposition))
    || ![0, 13].includes(Number(value.historicalCycle2Count)) || typeof value.historicalCycle2Count !== 'number'
    || !record(value.consent) || value.consent.consented !== true
    || !REQUEST_UUID_RE.test(String(value.consent.requestId)) || !record(value.authorizationRequestIds)
    || !Array.isArray(value.installments) || value.installments.length !== 12) return fail();
  const context = parseCycleContext(value.cycleContext);
  if (context.matriculaId !== scope.matriculaId || context.turmaId !== scope.turmaId || context.poloId !== scope.poloId
    || context.ciclo.numero !== 1 || context.ciclo.quantidadeItens !== 12 || context.ciclo.quantidadeBancaria !== 12
    || context.ciclo.quantidadeLocal !== 0 || context.ciclo.total !== value.activeTotal) return fail();
  const ids = new Set<string>(), keys = new Set<string>(), authorizations = new Set<string>();
  const canonicalIds: Record<string, string> = {};
  for (let i = 0; i < value.installments.length; i++) {
    const item = value.installments[i];
    const expectedDate = i < 3 ? `2026-${10 + i}-15` : `2027-${String(i - 2).padStart(2, '0')}-15`;
    const startsOn = expectedDate.slice(0, 8) + '16';
    if (!record(item) || !DATABASE_UUID_RE.test(String(item.id)) || typeof item.key !== 'string'
      || item.value !== '279.90' || item.dueDate !== expectedDate || ids.has(String(item.id)) || keys.has(item.key)) return fail();
    const persisted = context.ciclo.recebiveis.find((r) => r.id === item.id);
    const t = item.financialTerms;
    if (!persisted || persisted.tipo !== 'PARCELA' || persisted.numero !== i + 1 || persisted.destinoCobranca !== 'BANESE'
      || persisted.chave !== item.key || persisted.valor !== item.value || persisted.vencimento !== item.dueDate
      || !record(t) || t.nominalAmount !== 279.9 || t.dueDate !== expectedDate
      || !record(t.discount) || t.discount.type !== 'fixed' || t.discount.value !== 19.9 || t.discount.validUntil !== expectedDate
      || !record(t.penalty) || t.penalty.type !== 'percentage' || t.penalty.value !== 2 || t.penalty.startsOn !== startsOn
      || !record(t.interest) || t.interest.type !== 'monthly-percentage' || t.interest.value !== 1 || t.interest.startsOn !== startsOn) return fail();
    const authorizationId = value.authorizationRequestIds[String(item.id)];
    if (typeof authorizationId !== 'string' || !REQUEST_UUID_RE.test(authorizationId) || authorizations.has(authorizationId)) return fail();
    canonicalIds[String(item.id)] = authorizationId;
    ids.add(String(item.id)); keys.add(item.key); authorizations.add(authorizationId);
  }
  if (Object.keys(value.authorizationRequestIds).length !== 12) return fail();
  return { ...context, boundedCorrection: {
    operationId: String(value.operationId), fingerprint: String(value.fingerprint),
    consentRequestId: String(value.consent.requestId), authorizationRequestIds: canonicalIds,
  } };
};
export const correctionAuthorizationRequestId = (context: ManualCycleContext, receivableId: string) => {
  if (!context.boundedCorrection) return null;
  const id = context.boundedCorrection.authorizationRequestIds[receivableId];
  if (!id || !REQUEST_UUID_RE.test(id) || context.ciclo.numero !== 1) return fail();
  return id;
};
