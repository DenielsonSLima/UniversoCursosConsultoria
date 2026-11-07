import type { NfseEnvironment } from '../types/nfse.types';

/** Internal boundary for the future server dispatcher; never carries credentials. */
export interface NfseDispatchIntent {
  requestId: string;
  batchId: string;
  poloId: string;
  environment: NfseEnvironment;
}

export type NfseDispatchResult = {
  batchId: string;
  state: 'QUEUED' | 'BLOCKED';
};

export type NfseReconciliationResult =
  | { state: 'AUTHORIZED'; documentId: string; accessKey: string; number: string }
  | { state: 'REJECTED'; documentId: string; code: string; message: string }
  | { state: 'AWAITING_CONFIRMATION'; documentId: string };

export interface NfseApi {
  dispatch(intent: NfseDispatchIntent): Promise<NfseDispatchResult>;
  reconcile(documentId: string): Promise<NfseReconciliationResult>;
}
