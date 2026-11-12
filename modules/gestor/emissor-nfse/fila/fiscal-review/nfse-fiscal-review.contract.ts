import { NfseContractError } from '../../services/nfse.errors';
import { boolean, integer, list, nullableString, oneOf, record, string } from '../../services/nfse.validation';
import { queueMonth, queueUuid } from '../nfse-queue.contract';
import type { NfseFiscalReview, NfseFiscalReviewDefinition, NfseFiscalReviewSaved } from './nfse-fiscal-review.types';

export function fiscalReviewDate(value: unknown) {
  const date = string(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date) throw new NfseContractError();
  return date;
}
const nullableDate = (value: unknown) => value === null ? null : fiscalReviewDate(value);
const nullableUuid = (value: unknown) => value === null ? null : queueUuid(value);
export function fiscalReviewBasis(value: unknown) {
  const token = string(value);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new NfseContractError();
  return token;
}

export function fiscalReviewDefinition(value: NfseFiscalReviewDefinition): NfseFiscalReviewDefinition {
  if (value.recipient?.mode !== 'STUDENT' || value.recipient.confirmed !== true
    || value.classificationConfirmed !== true || value.receiptsConfirmed !== true) throw new NfseContractError();
  return { modelId: queueUuid(value.modelId), modelVersion: integer(value.modelVersion, 1),
    recipient: { mode: 'STUDENT', confirmed: true }, competenceDate: fiscalReviewDate(value.competenceDate),
    serviceDate: fiscalReviewDate(value.serviceDate), classificationConfirmed: true, receiptsConfirmed: true };
}

export function parseNfseFiscalReview(value: unknown, documentId: string): NfseFiscalReview {
  const data = record(value), preparation = record(data.preparation), originalModel = record(preparation.originalModel);
  const issuer = record(data.issuer), recipient = record(data.recipient), address = record(recipient.address), service = record(data.service);
  const reviewStatus = oneOf(data.reviewStatus, ['NOT_REVIEWED', 'CONFIRMED', 'STALE', 'BLOCKED']);
  const reviewComplete = boolean(data.reviewComplete);
  if (queueUuid(data.documentId) !== documentId || data.canTransmit !== false
    || (reviewComplete && reviewStatus !== 'CONFIRMED') || typeof preparation.amount !== 'string'
    || !/^(0|[1-9]\d{0,27})\.\d{2}$/.test(preparation.amount)) throw new NfseContractError();
  const savedAt = nullableString(data.savedAt);
  if (savedAt && !Number.isFinite(Date.parse(savedAt))) throw new NfseContractError();
  const paymentMonth = queueMonth(preparation.paymentMonth);
  const receiptCount = integer(preparation.receiptCount, 1);
  const paymentDates = preparation.paymentDates === undefined ? [] : list(preparation.paymentDates, fiscalReviewDate);
  if (paymentDates.length > Math.min(receiptCount, 31) || new Set(paymentDates).size !== paymentDates.length
    || paymentDates.some(date => date.slice(0, 7) !== paymentMonth)) throw new NfseContractError();
  return { documentId, revision: integer(data.revision), reviewStatus, basisToken: fiscalReviewBasis(data.basisToken),
    reviewComplete, canTransmit: false,
    validationSource: data.validationSource === undefined || data.validationSource === null ? null
      : oneOf(data.validationSource, ['MANUAL', 'SYSTEM_VALIDATED']),
    preparation: { studentName: string(preparation.studentName), classLabel: string(preparation.classLabel),
      paymentMonth, amount: preparation.amount, receiptCount, paymentDates: [...paymentDates].sort(),
      originalModel: { id: queueUuid(originalModel.id), version: integer(originalModel.version, 1), name: string(originalModel.name),
        nationalServiceCode: string(originalModel.nationalServiceCode) } },
    issuer: { name: nullableString(issuer.name), cnpj: string(issuer.cnpj), municipalityCode: nullableString(issuer.municipalityCode),
      municipalRegistration: nullableString(issuer.municipalRegistration), opSimpNac: nullableString(issuer.opSimpNac),
      regEspTrib: nullableString(issuer.regEspTrib), regApTribSN: nullableString(issuer.regApTribSN),
      configurationVersion: issuer.configurationVersion === null ? null : integer(issuer.configurationVersion, 1) },
    recipient: { mode: oneOf(recipient.mode, ['STUDENT']), studentId: queueUuid(recipient.studentId), name: nullableString(recipient.name),
      document: nullableString(recipient.document), confirmed: boolean(recipient.confirmed),
      address: { street: nullableString(address.street), number: nullableString(address.number), complement: nullableString(address.complement),
        district: nullableString(address.district), city: nullableString(address.city), state: nullableString(address.state), postalCode: nullableString(address.postalCode) } },
    service: { modelId: nullableUuid(service.modelId), modelVersion: service.modelVersion === null ? null : integer(service.modelVersion, 1),
      nationalServiceCode: nullableString(service.nationalServiceCode), nbsCode: nullableString(service.nbsCode),
      description: nullableString(service.description), issTreatment: nullableString(service.issTreatment),
      competenceDate: nullableDate(service.competenceDate), serviceDate: nullableDate(service.serviceDate) },
    checks: list(data.checks, item => { const check = record(item); return { code: string(check.code),
      status: oneOf(check.status, ['PASSED', 'BLOCKED', 'UNKNOWN']), message: string(check.message) }; }),
    savedAt, savedBy: nullableUuid(data.savedBy) };
}

export function parseNfseFiscalReviewSaved(value: unknown, documentId: string): NfseFiscalReviewSaved {
  const data = record(value);
  if (queueUuid(data.documentId) !== documentId) throw new NfseContractError();
  return { documentId, revision: integer(data.revision, 1), reviewId: queueUuid(data.reviewId), message: string(data.message) };
}

