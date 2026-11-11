import { NfseContractError } from '../services/nfse.errors';
import { boolean, list, nullableString, oneOf, record, string } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
import { parseNfsePublicPreflightDetails } from './nfse-homologation.public-details';
import type { NfseHomologationCapability, NfseHomologationPreflight,
  NfseHomologationPreview, NfseHomologationResult } from './nfse-homologation.types';

const timestamp = (value: unknown) => {
  const text = string(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) throw new NfseContractError();
  return text;
};
const date = (value: unknown) => {
  const text = string(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text))
    || new Date(text).toISOString().slice(0, 10) !== text) throw new NfseContractError();
  return text;
};
const capability = (value: unknown): NfseHomologationCapability => {
  const data = record(value);
  return { available: boolean(data.available), reason: nullableString(data.reason) };
};

export function parseNfseHomologationPreflight(value: unknown): NfseHomologationPreflight {
  const data = record(value);
  const checks = list(data.checks, item => {
    const check = record(item);
    return { code: string(check.code), status: oneOf(check.status, ['PASSED', 'BLOCKED', 'UNKNOWN']),
      message: string(check.message) };
  });
  if (!checks.length || new Set(checks.map(check => check.code)).size !== checks.length) throw new NfseContractError();
  return { checkedAt: timestamp(data.checkedAt), environment: oneOf(data.environment, ['HOMOLOGACAO']),
    referenceDate: date(data.referenceDate), checks, pilot: capability(data.pilot),
    certificateExpiresAt: data.certificateExpiresAt === null ? null : timestamp(data.certificateExpiresAt),
    ...parseNfsePublicPreflightDetails(data) };
}

export function parseNfseHomologationPreview(value: unknown): NfseHomologationPreview {
  const data = record(value), allowed = capability(data.capability);
  const previewId = queueUuid(data.previewId), expiresAt = timestamp(data.expiresAt);
  if (data.payload === null) {
    if (allowed.available) throw new NfseContractError();
    return { previewId, expiresAt, capability: allowed, payload: null };
  }
  const payload = record(data.payload);
  const partner = payload.technicalTest === true && payload.recipientSource === 'PARTNER' && payload.synthetic === undefined;
  const legacy = payload.synthetic === true && payload.technicalTest === undefined && payload.recipientSource === undefined && payload.recipientPartnerId === undefined;
  if ((!partner && !legacy) || payload.serviceAmount !== '1.00' || !['1', '3'].includes(String(payload.opSimpNac))
    || payload.issTreatment !== 'TRIBUTAVEL' || (legacy ? payload.recipientDocument !== payload.issuerDocument
      : typeof payload.recipientDocument !== 'string' || !/^(?:[0-9]{11}|[0-9]{14})$/.test(payload.recipientDocument))) throw new NfseContractError();
  return { previewId, expiresAt,
    capability: allowed, payload: {
      ...(partner ? { technicalTest: true as const, recipientSource: 'PARTNER' as const, recipientPartnerId: queueUuid(payload.recipientPartnerId) } : { synthetic: true as const }), issuerName: string(payload.issuerName), issuerDocument: string(payload.issuerDocument),
      recipientName: string(payload.recipientName), recipientDocument: string(payload.recipientDocument),
      serviceDescription: string(payload.serviceDescription), nationalServiceCode: string(payload.nationalServiceCode),
      competence: date(payload.competence), serviceDate: date(payload.serviceDate), serviceAmount: payload.serviceAmount,
      opSimpNac: oneOf(payload.opSimpNac, ['1', '3']), issTreatment: string(payload.issTreatment),
    } };
}

export function parseNfseHomologationResult(value: unknown): NfseHomologationResult {
  const data = record(value);
  const state = oneOf(data.state, ['AUTHORIZED', 'REJECTED', 'AWAITING_CONFIRMATION', 'BLOCKED']);
  const number = data.number == null ? null : string(data.number);
  const accessKey = data.accessKey == null ? null : string(data.accessKey);
  if ((state === 'AUTHORIZED' && (!number || !accessKey || !/^\d{50}$/.test(accessKey)))
    || (state !== 'AUTHORIZED' && (number !== null || accessKey !== null))) throw new NfseContractError();
  return { state, attemptId: queueUuid(data.attemptId), number, accessKey, message: string(data.message) };
}

const reasonLabels: Record<string, string> = {
  PILOT_EXECUTOR_NOT_CONFIGURED: 'O serviço de emissão do teste ainda precisa ser disponibilizado.',
  PREFLIGHT_REQUIRED: 'Confira novamente a conexão e a habilitação antes de preparar o teste.',
  PREFLIGHT_BLOCKED: 'Resolva as verificações indicadas antes de preparar o teste.',
  PILOT_MTLS_SPEC_UNVERIFIED: 'A conexão autenticada ainda precisa ser confirmada antes do envio do teste. Verifique novamente o acesso fiscal.',
  PILOT_JSON_ENVELOPE_UNVERIFIED: 'A resposta do serviço fiscal ainda precisa ser validada antes do envio do teste.',
  PILOT_SIGNATURE_PROFILE_CHANGED: 'A validação da assinatura precisa ser atualizada antes do envio do teste.',
  PILOT_PREFLIGHT_EXPIRED: 'A verificação de acesso expirou. Verifique novamente a conexão e a habilitação.',
};

export const nfseHomologationReason = (reason: string | null) => reason && reasonLabels[reason]
  ? reasonLabels[reason] : 'O serviço ainda não liberou esta etapa do teste. Confira as verificações acima.';

export function nfseHomologationResultExplanation(result: Pick<NfseHomologationResult, 'state' | 'message'>): string | null {
  if (result.state !== 'REJECTED' || !/\bE0037\b/.test(result.message)) return null;
  return 'A SEFIN não encontrou o convênio do município emissor neste ambiente de homologação. '
    + 'Confirme a situação do convênio nesse ambiente com o responsável fiscal. '
    + 'Esta rejeição não comprova a situação em produção.';
}
