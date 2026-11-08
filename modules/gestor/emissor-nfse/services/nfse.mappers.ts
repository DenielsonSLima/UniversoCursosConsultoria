import type {
  NfseCandidate, NfseConfiguration, NfseDocument, NfseModel, NfseMutationResult,
  NfsePage, NfseReadiness, NfseWorkspace,
} from '../types/nfse.types';
import { NfseContractError } from './nfse.errors';
import { parseNfseStoredModel } from '../modelos/services/nfse-models.contract';
import {
  assertUniqueIds, boolean, integer, list, money, nullableInteger, nullableString,
  oneOf, record, string,
} from './nfse.validation';

const readiness = (value: unknown): NfseReadiness => {
  const row = record(value);
  return { status: oneOf(row.status, ['READY', 'BLOCKED']), message: string(row.message, true) };
};

export function mapNfseModel(value: unknown): NfseModel {
  return parseNfseStoredModel(value);
}

export function mapNfseWorkspace(value: unknown): NfseWorkspace {
  const row = record(value);
  const caps = record(row.capabilities);
  const summary = record(row.summary);
  const classes = list(row.classes, (item) => {
    const entry = record(item);
    return { id: string(entry.id), label: string(entry.label) };
  });
  const models = list(row.models, mapNfseModel);
  assertUniqueIds(classes);
  assertUniqueIds(models);
  return {
    capabilities: {
      prepare: boolean(caps.prepare), manageModels: boolean(caps.manageModels),
      issue: boolean(caps.issue), retry: boolean(caps.retry), configure: boolean(caps.configure),
    },
    readiness: readiness(row.readiness),
    summary: {
      receivedAmount: money(summary.receivedAmount), preparedAmount: money(summary.preparedAmount),
      pendingCount: nullableInteger(summary.pendingCount), issuedCount: nullableInteger(summary.issuedCount),
      errorCount: nullableInteger(summary.errorCount),
    },
    classes, models,
  };
}

export function mapNfseCandidate(value: unknown): NfseCandidate {
  const row = record(value);
  const candidate = {
    id: string(row.id), studentName: string(row.studentName), enrollmentId: string(row.enrollmentId),
    classId: string(row.classId), classLabel: string(row.classLabel),
    receivedAmount: money(row.receivedAmount), serviceAmount: money(row.serviceAmount),
    eligible: boolean(row.eligible), blockingReason: nullableString(row.blockingReason),
  };
  if (candidate.eligible && (candidate.receivedAmount === null || candidate.serviceAmount === null)) {
    throw new NfseContractError();
  }
  return candidate;
}

export function mapNfseDocument(value: unknown): NfseDocument {
  const row = record(value);
  const document: NfseDocument = {
    id: string(row.id), studentName: string(row.studentName), classLabel: string(row.classLabel),
    amount: money(row.amount), modelLabel: string(row.modelLabel),
    status: oneOf(row.status, ['PENDENTE', 'EM_PROCESSAMENTO', 'AGUARDANDO_CONFIRMACAO', 'EMITIDA', 'ERRO']),
    number: nullableString(row.number), accessKey: nullableString(row.accessKey),
    errorCode: nullableString(row.errorCode), errorMessage: nullableString(row.errorMessage),
    retryable: boolean(row.retryable),
  };
  if ((document.status === 'EMITIDA' && (!document.number || !document.accessKey || document.amount === null))
    || (document.retryable && document.status !== 'ERRO')) throw new NfseContractError();
  return document;
}

export function mapNfsePage<T extends { id: string }>(
  value: unknown, parse: (row: unknown) => T, expectedPage: number,
): NfsePage<T> {
  const payload = record(value);
  const rows = list(payload.rows, parse);
  const page = integer(payload.page, 1);
  const pageSize = integer(payload.pageSize, 1);
  const totalItems = integer(payload.totalItems);
  if (page !== expectedPage || pageSize > 100 || rows.length > pageSize || rows.length > totalItems) {
    throw new NfseContractError();
  }
  assertUniqueIds(rows);
  return { rows, page, pageSize, totalItems };
}

export function mapNfseConfiguration(value: unknown): NfseConfiguration {
  const row = record(value);
  const certificate = record(row.certificate);
  return {
    poloId: string(row.poloId), cnpj: string(row.cnpj),
    municipalityCode: nullableString(row.municipalityCode), municipalRegistration: nullableString(row.municipalRegistration),
    portalAccess: oneOf(row.portalAccess, ['PASSWORD', 'CERTIFICATE', 'GOVBR']),
    credentialSource: oneOf(row.credentialSource, ['MATRIZ', 'PROPRIO']),
    environment: oneOf(row.environment, ['HOMOLOGACAO', 'PRODUCAO']),
    certificate: {
      configured: boolean(certificate.configured), subject: nullableString(certificate.subject),
      expiresAt: nullableString(certificate.expiresAt),
    },
    portalLoginConfigured: boolean(row.portalLoginConfigured), readiness: readiness(row.readiness),
    canManage: boolean(row.canManage),
  };
}

export function mapNfseMutation(value: unknown): NfseMutationResult {
  const row = record(value);
  return { id: string(row.id), version: integer(row.version, 1), message: string(row.message) };
}
