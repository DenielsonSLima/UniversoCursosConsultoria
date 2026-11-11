import type { NfseOperationReference } from '../emissao/nfse-operation.contract';
import type { NfseScope } from '../types/nfse.types';

/** Preparation only. These records never attest fiscal authorization. */
export interface NfseQueueRow extends NfseOperationReference {
  id: string;
  batchId: string;
  studentId: string;
  studentName: string;
  classId: string;
  classLabel: string;
  amount: string;
  modelLabel: string;
  status: 'PREPARADO';
  receiptCount: number;
  paymentMonth: string;
  createdAt: string;
  blockingReasons: string[];
}

export interface NfseQueuePage {
  rows: NfseQueueRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalAmount: string;
  summary: { preparedCount: number; preparedAmount: string };
  providerEnabled: false;
}

export interface NfseQueuePreparationInput {
  requestId: string;
  candidateIds: string[];
  modelId: string;
  modelVersion: number;
  /** Payment-month selection is distinct from the queue month and fiscal competence. */
  paymentMonth: string;
}

export interface NfseQueuePreparationResult {
  id: string;
  version: 1;
  documentCount: number;
  receiptCount: number;
  totalAmount: string;
  documentIds: string[];
  message: string;
}

export type NfseQueueInput = NfseQueuePreparationInput;
export type NfseQueueSaved = NfseQueuePreparationResult;

export interface NfseQueueEnvelope<T> { version: 1; scope: NfseScope; data: T }

export const NFSE_QUEUE_RPC = {
  prepare: 'prepare_nfse_batch_secure',
  list: 'get_nfse_queue_secure',
} as const;

export const nfseQueueKeys = {
  scope: (scope: NfseScope | null) => ['nfse-queue', 'v1', scope?.contextKey ?? '',
    scope?.poloId ?? '', scope?.environment ?? '', scope?.month ?? ''] as const,
  list: (scope: NfseScope | null, page: number) => [...nfseQueueKeys.scope(scope), 'list', 'PREPARADO', page] as const,
};
