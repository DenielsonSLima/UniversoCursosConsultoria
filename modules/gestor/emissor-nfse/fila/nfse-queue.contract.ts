import { NfseContractError } from '../services/nfse.errors';
import { assertUniqueIds, integer, list, oneOf, record, string } from '../services/nfse.validation';
import type { NfseQueueInput, NfseQueuePage, NfseQueueSaved } from './nfse-queue.types';

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function queueUuid(value: unknown): string {
  const id = string(value);
  if (!new RegExp(`^${uuidPattern}$`, 'i').test(id)) throw new NfseContractError();
  return id;
}
export function queueMonth(value: unknown): string {
  const month = string(value);
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new NfseContractError();
  return month;
}
const amount = (value: unknown) => {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,27})\.\d{2}$/.test(value)) throw new NfseContractError();
  return value;
};

export function queueInput(input: NfseQueueInput) {
  if (!Array.isArray(input.candidateIds) || !input.candidateIds.length || input.candidateIds.length > 1000
    || new Set(input.candidateIds).size !== input.candidateIds.length
    || input.candidateIds.some(id => typeof id !== 'string' || !new RegExp(`^${uuidPattern}:${uuidPattern}$`, 'i').test(id))) {
    throw new NfseContractError();
  }
  return { p_request_id: queueUuid(input.requestId), p_candidate_ids: [...input.candidateIds].sort(),
    p_model_id: queueUuid(input.modelId), p_model_version: integer(input.modelVersion, 1),
    p_payment_month: queueMonth(input.paymentMonth) };
}

export function parseQueuePage(value: unknown, expectedPage: number): NfseQueuePage {
  const payload = record(value);
  if (payload.providerEnabled !== false) throw new NfseContractError();
  const rows = list(payload.rows, item => {
    const row = record(item);
    return { id: queueUuid(row.id), batchId: queueUuid(row.batchId), studentId: queueUuid(row.studentId),
      studentName: string(row.studentName), classId: queueUuid(row.classId), classLabel: string(row.classLabel),
      amount: amount(row.amount), modelLabel: string(row.modelLabel), status: oneOf(row.status, ['PREPARADO']),
      receiptCount: integer(row.receiptCount, 1), paymentMonth: queueMonth(row.paymentMonth),
      createdAt: string(row.createdAt), blockingReasons: list(row.blockingReasons, item => string(item)) };
  });
  const page = integer(payload.page, 1), pageSize = integer(payload.pageSize, 1);
  const totalItems = integer(payload.totalItems);
  const summary = record(payload.summary);
  if (page !== expectedPage || pageSize > 100 || rows.length > pageSize || rows.length > totalItems) throw new NfseContractError();
  assertUniqueIds(rows);
  return { rows, page, pageSize, totalItems, totalAmount: amount(payload.totalAmount),
    summary: { preparedCount: integer(summary.preparedCount), preparedAmount: amount(summary.preparedAmount) },
    providerEnabled: false };
}

export function parseQueueSaved(value: unknown): NfseQueueSaved {
  const row = record(value);
  const documentCount = integer(row.documentCount, 1);
  if (!Array.isArray(row.documentIds) || row.documentIds.length !== documentCount || documentCount > 1000) throw new NfseContractError();
  const documentIds = row.documentIds.map(queueUuid);
  if (new Set(documentIds).size !== documentCount) throw new NfseContractError();
  if (row.version !== 1) throw new NfseContractError();
  return { id: queueUuid(row.id), version: 1, documentCount,
    receiptCount: integer(row.receiptCount, documentCount), totalAmount: amount(row.totalAmount),
    documentIds, message: string(row.message) };
}
