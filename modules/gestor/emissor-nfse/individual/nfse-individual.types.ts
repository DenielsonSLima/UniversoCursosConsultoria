import type { NfseEmissionSource } from '../emissao/nfse-operation.contract';
import type { NfseScope } from '../types/nfse.types';
import type { NfseCancellationModel } from '../cancelamento/nfse-cancellation-models.contract';
export interface IndividualDefinition {
  partnerId: string; modelId: string; modelVersion: number; amount: '1.00'; competenceDate: string; serviceDate: string;
}
export interface IndividualPayload {
  issuerName: string; issuerCnpj: string; recipientName: string; recipientDocument: string;
  modelId: string; modelVersion: number; modelName: string; amount: string; competenceDate: string; serviceDate: string; series: string;
  nationalServiceCode: string; nbsCode: string; serviceDescription: string; opSimpNac: '1' | '2' | '3';
  regApTribSN: '1' | '2' | '3' | null; municipalityCode: string; municipalRegistration: string | null;
  simpleNationalTransparencyPercent?: string | null;
  ibsCbs?: { included: boolean; cst: string | null; classificationCode: string | null; operationIndicatorCode: string | null;
    recipientSameAsAcquirer: boolean | null; personalUse: boolean | null; governmentPurchase: boolean | null } | null;
}
export interface IndividualCapability { available: boolean; reason: string | null }
export interface IndividualPreview {
  previewId: string; expiresAt: string; state: 'PREVIEWED'; payload: IndividualPayload | null; capability: IndividualCapability;
}
export type IndividualIssueState = 'PREVIEWED' | 'AUTHORIZED' | 'REJECTED' | 'AWAITING_CONFIRMATION' | 'BLOCKED';
export interface IndividualIssueResult {
  previewId: string; state: IndividualIssueState; message: string; payload: IndividualPayload;
  number: string | null; accessKey: string | null; codes?: string[]; capability?: IndividualCapability;
  expiresAt?: string;
}
export interface IndividualCancelPayload { number: string; accessKey: string; reasonCode: '1' | '2' | '9'; justification: string;
  cancellationModel?: NfseCancellationModel | null; detail?: string | null }
export interface IndividualCancelPreview {
  previewId: string; cancelPreviewId: string; expiresAt: string; state: 'PREVIEWED';
  payload: IndividualCancelPayload; capability: IndividualCapability;
}
export interface IndividualCancelResult {
  previewId: string; cancelPreviewId: string; state: 'PREVIEWED' | 'CANCELLED' | 'CANCELLATION_PENDING' | 'CANCELLATION_REJECTED' | 'AWAITING_ANALYSIS' | 'BLOCKED';
  message: string; payload: IndividualCancelPayload; codes?: string[]; capability?: IndividualCapability;
  expiresAt?: string;
  retry?: { availableAt: string | null; used: boolean };
}
export interface NfseIndividualService {
  previewSource(scope: NfseScope, requestId: string, source: NfseEmissionSource, competenceDate?: string): Promise<IndividualPreview>;
  preview(scope: NfseScope, requestId: string, definition: IndividualDefinition): Promise<IndividualPreview>;
  issue(scope: NfseScope, requestId: string, previewId: string): Promise<IndividualIssueResult>;
  reconcile(scope: NfseScope, requestId: string, previewId: string): Promise<IndividualIssueResult>;
  previewCancellation(scope: NfseScope, requestId: string, previewId: string, justification: string): Promise<IndividualCancelPreview>;
  previewCancellationModel(scope: NfseScope, requestId: string, previewId: string, model: { id: string; version: number }, detail: string | null): Promise<IndividualCancelPreview>;
  cancel(scope: NfseScope, requestId: string, previewId: string, cancelPreviewId: string): Promise<IndividualCancelResult>;
  reconcileCancellation(scope: NfseScope, requestId: string, previewId: string, cancelPreviewId: string): Promise<IndividualCancelResult>;
  retryCancellation(scope: NfseScope, requestId: string, previewId: string, cancelPreviewId: string, retryRequestId: string): Promise<IndividualCancelResult>;
}
export interface IndividualAttempt { requestId: string; previewId: string; cancelPreviewId?: string; retryRequestId?: string }
