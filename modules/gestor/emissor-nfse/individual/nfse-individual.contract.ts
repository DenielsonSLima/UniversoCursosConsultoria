import { NfseContractError } from '../services/nfse.errors';
import { boolean, integer, nullableString, oneOf, record, string } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
import type { IndividualDefinition, IndividualPayload, IndividualPreview, IndividualIssueResult,
  IndividualCancelPayload, IndividualCancelPreview, IndividualCancelResult } from './nfse-individual.types';
import { parseCancellationModel } from '../cancelamento/nfse-cancellation-models.contract';
const fail = (): never => { throw new NfseContractError(); };
const text = (value: unknown, max = 500) => { const result = string(value).trim(); return result.length <= max ? result : fail(); };
const digits = (value: unknown, pattern: RegExp) => { const result = text(value); return pattern.test(result) ? result : fail(); };
export const individualDate = (value: unknown) => {
  const result = digits(value, /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/);
  return Number.isFinite(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result ? result : fail();
};
const timestamp = (value: unknown) => { const result = text(value); return /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(result) && Number.isFinite(Date.parse(result)) ? result : fail(); };
const capability = (value: unknown) => { const row = record(value); return { available: boolean(row.available), reason: nullableString(row.reason) }; };
const resultCodes = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 100) return fail();
  return value.map(code => digits(code, /^[A-Z0-9_-]{1,32}$/));
};
export const individualRejectionExplanation = (codes?: readonly string[]) => codes?.includes('E0120')
  ? 'A inscrição municipal do prestador não deve ser enviada quando o município emissor não possui informações complementares no CNC NFS-e. Revise esse campo na configuração da integração. Esta tentativa permanece rejeitada.' : null;
function ibsCbs(value: unknown): IndividualPayload['ibsCbs'] {
  if (value == null) return null;
  const row = record(value), flag = (value: unknown) => value === null ? null : boolean(value);
  const code = (value: unknown, pattern: RegExp) => value === null ? null : digits(value, pattern);
  return { included: boolean(row.included), cst: code(row.cst, /^[0-9]{3}$/), classificationCode: code(row.classificationCode, /^[0-9]{6}$/),
    operationIndicatorCode: code(row.operationIndicatorCode, /^[0-9]{6}$/), recipientSameAsAcquirer: flag(row.recipientSameAsAcquirer),
    personalUse: flag(row.personalUse), governmentPurchase: flag(row.governmentPurchase) };
}
function serviceLocation(value: unknown): IndividualPayload['serviceLocation'] {
  if (value === null) return null;
  const row = record(value);
  const nullableCode = (value: unknown, pattern: RegExp) => value === null ? null : digits(value, pattern);
  return { source: oneOf(row.source, ['ISSUER_ESTABLISHMENT', 'MODEL_FIXED', 'ISSUED_SNAPSHOT']),
    countryCode: digits(row.countryCode, /^[A-Z]{3}$/),
    municipalityCode: nullableCode(row.municipalityCode, /^[0-9]{7}$/),
    modelMunicipalityCode: nullableCode(row.modelMunicipalityCode, /^[0-9]{7}$/),
    operationIndicatorCode: nullableCode(row.operationIndicatorCode, /^[0-9]{6}$/) };
}
export function individualDefinition(value: IndividualDefinition): IndividualDefinition {
  if (value.amount !== '1.00') return fail();
  return { partnerId: queueUuid(value.partnerId), modelId: queueUuid(value.modelId), modelVersion: integer(value.modelVersion, 1), amount: '1.00',
    competenceDate: individualDate(value.competenceDate), serviceDate: individualDate(value.serviceDate) };
}
export function individualPayload(value: unknown): IndividualPayload {
  const row = record(value);
  if (typeof row.amount !== 'string' || !/^(?:0|[1-9][0-9]{0,14})\.[0-9]{2}$/.test(row.amount) || row.amount === '0.00') return fail();
  const municipalRegistration = row.municipalRegistration === null ? null : string(row.municipalRegistration, true).trim();
  if (municipalRegistration && municipalRegistration.length > 15) return fail();
  const snPercent = row.simpleNationalTransparencyPercent;
  if (snPercent !== undefined && snPercent !== null && (typeof snPercent !== 'string'
    || !/^(?:0|[1-9][0-9]{0,2})\.[0-9]{2}$/.test(snPercent) || Number(snPercent) > 100)) return fail();
  return { issuerName: text(row.issuerName, 300), issuerCnpj: digits(row.issuerCnpj, /^[0-9]{14}$/),
    recipientName: text(row.recipientName, 300), recipientDocument: digits(row.recipientDocument, /^(?:[0-9]{11}|[0-9]{14})$/),
    modelId: queueUuid(row.modelId), modelVersion: integer(row.modelVersion, 1), modelName: text(row.modelName, 120), amount: row.amount,
    competenceDate: individualDate(row.competenceDate), serviceDate: individualDate(row.serviceDate), series: digits(row.series, /^[0-9]{1,5}$/),
    nationalServiceCode: digits(row.nationalServiceCode, /^[0-9]{6}$/), nbsCode: digits(row.nbsCode, /^[0-9]{9}$/),
    serviceDescription: text(row.serviceDescription, 2000), opSimpNac: oneOf(row.opSimpNac, ['1', '2', '3']),
    regApTribSN: row.regApTribSN === null ? null : oneOf(row.regApTribSN, ['1', '2', '3']),
    municipalityCode: digits(row.municipalityCode, /^[0-9]{7}$/), municipalRegistration: municipalRegistration || null,
    ...(snPercent === undefined ? {} : { simpleNationalTransparencyPercent: snPercent as string | null }),
    ...(row.serviceLocation === undefined ? {} : { serviceLocation: serviceLocation(row.serviceLocation) }),
    ...(row.ibsCbs === undefined ? {} : { ibsCbs: ibsCbs(row.ibsCbs) }) };
}
export function parseIndividualPreview(value: unknown): IndividualPreview {
  const row = record(value), allowed = capability(row.capability);
  if (row.payload === null && allowed.available) return fail();
  return { previewId: queueUuid(row.previewId), expiresAt: timestamp(row.expiresAt), state: oneOf(row.state, ['PREVIEWED']),
    capability: allowed, payload: row.payload === null ? null : individualPayload(row.payload) };
}
export function parseIndividualIssueResult(value: unknown): IndividualIssueResult {
  const row = record(value), state = oneOf(row.state, ['PREVIEWED', 'AUTHORIZED', 'REJECTED', 'AWAITING_CONFIRMATION', 'BLOCKED']);
  const number = row.number == null ? null : digits(row.number, /^[1-9][0-9]{0,12}$/);
  const accessKey = row.accessKey == null ? null : digits(row.accessKey, /^[0-9]{50}$/);
  if (state === 'AUTHORIZED' ? !number || !accessKey : number !== null || accessKey !== null) return fail();
  return { previewId: queueUuid(row.previewId), state, message: text(row.message), payload: individualPayload(row.payload), number, accessKey,
    ...(row.cancelPreviewId === undefined ? {} : { cancelPreviewId: row.cancelPreviewId === null ? null : queueUuid(row.cancelPreviewId) }),
    ...(row.codes === undefined ? {} : { codes: resultCodes(row.codes) }), ...(row.expiresAt === undefined ? {} : { expiresAt: timestamp(row.expiresAt) }), ...(row.capability === undefined ? {} : { capability: capability(row.capability) }) };
}
export function individualJustification(value: unknown) { const result = text(value, 255); return result.length >= 15 && !/\{\{|\}\}/.test(result) ? result : fail(); }
export function individualCancellationModel(value: { id: string; version: number }) {
  const id = text(value.id, 90);
  if (!/^SYSTEM:[A-Z0-9_]{1,80}$/.test(id)) queueUuid(id);
  return { id, version: integer(value.version, 1) };
}
export function individualCancellationDetail(value: unknown): string | null {
  if (value === null) return null;
  const detail = text(value, 255);
  return /\{\{|\}\}/.test(detail) || [...detail].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? fail() : detail;
}
function cancelPayload(value: unknown): IndividualCancelPayload {
  const row = record(value);
  const model = row.cancellationModel == null ? null : parseCancellationModel(row.cancellationModel);
  const detail = row.detail == null ? null : individualCancellationDetail(row.detail);
  if (model && (model.reasonCode !== row.reasonCode || model.requiresDetail !== (detail !== null)) || !model && detail !== null) return fail();
  return { number: digits(row.number, /^[1-9][0-9]{0,12}$/), accessKey: digits(row.accessKey, /^[0-9]{50}$/),
    reasonCode: oneOf(row.reasonCode, ['1', '2', '9']), justification: individualJustification(row.justification),
    ...(row.cancellationModel === undefined && row.detail === undefined ? {} : { cancellationModel: model, detail }) };
}
export function parseIndividualCancelPreview(value: unknown): IndividualCancelPreview {
  const row = record(value);
  return { previewId: queueUuid(row.previewId), cancelPreviewId: queueUuid(row.cancelPreviewId), expiresAt: timestamp(row.expiresAt),
    state: oneOf(row.state, ['PREVIEWED']), payload: cancelPayload(row.payload), capability: capability(row.capability) };
}
export function parseIndividualCancelResult(value: unknown): IndividualCancelResult {
  const row = record(value);
  return { previewId: queueUuid(row.previewId), cancelPreviewId: queueUuid(row.cancelPreviewId),
    state: oneOf(row.state, ['PREVIEWED', 'CANCELLED', 'CANCELLATION_PENDING', 'CANCELLATION_REJECTED', 'AWAITING_ANALYSIS', 'BLOCKED']),
    message: text(row.message), payload: cancelPayload(row.payload), ...(row.codes === undefined ? {} : { codes: resultCodes(row.codes) }), ...(row.expiresAt === undefined ? {} : { expiresAt: timestamp(row.expiresAt) }),
    ...(row.capability === undefined ? {} : { capability: capability(row.capability) }),
    ...(row.retry === undefined ? {} : { retry: { availableAt: record(row.retry).availableAt === null ? null : timestamp(record(row.retry).availableAt), used: boolean(record(row.retry).used) } }) };
}
const reasonMessages: Record<string, string> = {
  PRODUCTION_EVENT_JSON_CONTRACT_UNVERIFIED: 'O serviço fiscal ainda não confirmou o formato de envio e retorno do evento de cancelamento.',
  PRODUCTION_MTLS_SPEC_UNVERIFIED: 'Não foi possível confirmar a conexão autenticada e o contrato do serviço fiscal. Consulte novamente esta operação.',
  PRODUCTION_SPECIFICATION_UNVERIFIED: 'O contrato publicado pelo serviço fiscal ainda precisa ser validado para esta operação.',
  PRODUCTION_JSON_ENVELOPE_UNVERIFIED: 'O formato de envio e retorno da NFS-e ainda não foi confirmado pelo serviço fiscal.',
  PRODUCTION_PREVIEW_EXPIRED: 'A revisão desta operação expirou. Renove a conferência antes do envio.',
  PRODUCTION_OPERATION_ALREADY_DISPATCHED: 'Esta operação já foi enviada. Consulte o resultado usando o mesmo vínculo.',
  PRODUCTION_REVIEW_CHANGED: 'Os parâmetros fiscais mudaram desde a revisão. Confira esta operação antes de transmitir.',
  PRODUCTION_OWN_AUTHORIZED_DOCUMENT_REQUIRED: 'O cancelamento exige uma nota autorizada e vinculada a esta operação do sistema.',
  FISCAL_SERVICE_LOCATION_REVIEW_REQUIRED: 'Revise no modelo o país e o município onde o serviço foi prestado.',
  FISCAL_VALUES_REVIEW_REQUIRED: 'Complete e confirme as regras da etapa Valores no modelo selecionado.',
  FISCAL_PARTICIPANTS_STRATEGY_REVIEW_REQUIRED: 'Revise as regras da emissão para usar os participantes definidos na operação, sem cadastros fixos no modelo.',
  FISCAL_TRANSPARENCY_REVIEW_REQUIRED: 'Confirme no modelo a origem dos tributos aproximados desta operação.',
  FISCAL_IBSCBS_REVIEW_REQUIRED: 'Confira as regras de IBS/CBS para o enquadramento e a competência desta nota.',
  FISCAL_RECIPIENT_ADDRESS_RESOLUTION_REQUIRED: 'O endereço do tomador ainda precisa ser confirmado pelo cadastro autorizado.',
  FISCAL_RECIPIENT_ADDRESS_REVIEW_REQUIRED: 'O endereço do tomador está incompleto. Corrija cidade e UF no cadastro e atualize os dados da emissão.',
  FISCAL_RECIPIENT_ADDRESS_NUMBER_REQUIRED: 'Falta o número do endereço no cadastro do tomador. Preencha o número ou S/N, quando aplicável, e atualize os dados da emissão.',
  FISCAL_RECIPIENT_POSTAL_CODE_REQUIRED: 'O CEP do tomador deve ter 8 dígitos. Corrija o cadastro e atualize os dados da emissão.',
  FISCAL_RECIPIENT_STREET_REQUIRED: 'Falta o logradouro no cadastro do tomador. Corrija o cadastro e atualize os dados da emissão.',
  FISCAL_RECIPIENT_DISTRICT_REQUIRED: 'Falta o bairro no cadastro do tomador. Corrija o cadastro e atualize os dados da emissão.',
  INDIVIDUAL_ISS_TREATMENT_UNSUPPORTED: 'Este executor atende serviços tributáveis. O tratamento de ISS escolhido exige outra adaptação antes de emitir.',
  INDIVIDUAL_GOVERNMENT_OPERATION_UNSUPPORTED: 'A operação governamental está cadastrada no modelo, mas ainda não é atendida por este executor.',
  FISCAL_GOVERNMENT_OPERATION_UNSUPPORTED: 'A operação governamental de IBS/CBS exige uma adaptação antes de transmitir.',
  INDIVIDUAL_SIMPLE_NATIONAL_PROFILE_UNSUPPORTED: 'Este executor atende optante do Simples Nacional com apuração integral pelo Simples. Confira o enquadramento confirmado.',
  FISCAL_ISS_PROFILE_REVIEW_REQUIRED: 'Confira o ISS: este executor atende regime especial nenhum, sem retenção, suspensão ou benefício municipal.',
  INDIVIDUAL_DISCOUNTS_DEDUCTIONS_UNSUPPORTED: 'Os descontos, deduções ou valores de intermediário escolhidos ainda não são atendidos por este executor.',
  FISCAL_FEDERAL_RETENTIONS_REVIEW_REQUIRED: 'As retenções federais escolhidas exigem adaptação antes de transmitir esta operação.',
  INDIVIDUAL_ADDITIONAL_SERVICE_UNSUPPORTED: 'Obra, imóvel, evento, comércio exterior ou outra informação adicional de serviço ainda exige adaptação do executor.',
  INDIVIDUAL_ADDITIONAL_PARTICIPANTS_UNSUPPORTED: 'As regras adicionais de participantes escolhidas ainda não são atendidas por este executor.',
  INDIVIDUAL_DOCUMENT_REFERENCES_UNSUPPORTED: 'As referências documentais cadastradas exigem adaptação antes de transmitir esta operação.',
  FISCAL_MODEL_DPS_SERIES_MISMATCH: 'A série DPS escolhida no modelo difere da série atribuída pelo sistema. Confira a regra de numeração.',
  FISCAL_COMPETENCE_MODEL_MISMATCH: 'A competência confirmada difere da regra do modelo selecionado. Confira as datas da preparação.',
  FISCAL_SERVICE_DATE_COMPETENCE_MISMATCH: 'A competência definida pelo modelo difere da data da prestação salva. Este executor ainda exige datas iguais; a preparação foi preservada sem envio.',
  FISCAL_IBSCBS_DESTINATION_REVIEW_REQUIRED: 'Este executor atende IBS/CBS com destinatário igual ao adquirente. Confira a regra do modelo.',
  FISCAL_IBSCBS_PERSONAL_USE_REVIEW_REQUIRED: 'Confirme no modelo se o serviço se destina a uso pessoal.',
  FISCAL_IBSCBS_CLASSIFICATION_REVIEW_REQUIRED: 'Selecione uma classificação tributária oficial válida para a competência e confirme o enquadramento aplicável.',
  FISCAL_IBSCBS_DEPENDENT_GROUP_UNSUPPORTED: 'A classificação exige grupos complementares de IBS/CBS ainda não atendidos por este executor.',
  FISCAL_IBSCBS_OPERATION_INDICATOR_REQUIRED: 'Selecione o indicador da operação no catálogo oficial antes de renovar a prévia.',
  PRODUCTION_DPS_SERIES_SCHEMA_CONFLICT: 'A validação da série DPS no contrato de produção ainda precisa ser concluída antes do envio.',
  PRODUCTION_CANCELLATION_ELIGIBILITY_UNCONFIRMED: 'O serviço fiscal ainda não confirmou que esta nota pode ser cancelada diretamente.',
};
export const individualReason = (reason: string | null) => reason && reasonMessages[reason]
  ? reasonMessages[reason] : 'O servidor ainda não liberou esta etapa. Confira os parâmetros e a revisão fiscal.';
