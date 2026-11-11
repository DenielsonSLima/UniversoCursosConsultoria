import type { NfseScope } from '../types/nfse.types';

export interface NfseHomologationCheck {
  code: string;
  status: 'PASSED' | 'BLOCKED' | 'UNKNOWN';
  message: string;
}

export interface NfseHomologationCapability { available: boolean; reason: string | null }

export interface NfseHomologationPreflight {
  checkedAt: string;
  environment: 'HOMOLOGACAO';
  referenceDate: string;
  checks: NfseHomologationCheck[];
  pilot: NfseHomologationCapability;
  certificateExpiresAt: string | null;
  endpoints?: NfseHomologationEndpoint[];
  municipalParameters?: NfseHomologationMunicipalParameter[];
}

/** Authenticated technical preview. Party snapshots stay out of storage and logs. */
interface NfseHomologationPayloadFields {
  issuerName: string;
  issuerDocument: string;
  recipientName: string;
  recipientDocument: string;
  serviceDescription: string;
  nationalServiceCode: string;
  competence: string;
  serviceDate: string;
  serviceAmount: string;
  opSimpNac: '1' | '3';
  issTreatment: string;
}

export type NfseHomologationPayload = NfseHomologationPayloadFields & (
  { synthetic: true; technicalTest?: never; recipientSource?: never; recipientPartnerId?: never }
  | { synthetic?: never; technicalTest: true; recipientSource: 'PARTNER'; recipientPartnerId: string }
);
export interface NfseHomologationEndpoint { code: string; url: string; status: number | null; tlsVerified: boolean; error: string | null }
export type NfsePublicParameter = boolean | number | string | null | NfsePublicParameter[] | { [key: string]: NfsePublicParameter };
export interface NfseHomologationMunicipalParameter {
  code: string; url: string; status: number | null; diagnostic: string; parameters: NfsePublicParameter;
}

export interface NfseHomologationPreview {
  previewId: string;
  expiresAt: string;
  payload: NfseHomologationPayload | null;
  capability: NfseHomologationCapability;
}

export interface NfseHomologationResult {
  state: 'AUTHORIZED' | 'REJECTED' | 'AWAITING_CONFIRMATION' | 'BLOCKED';
  attemptId: string;
  number: string | null;
  accessKey: string | null;
  message: string;
}

export interface NfseHomologationService {
  preflight(scope: NfseScope): Promise<NfseHomologationPreflight>;
  preview(scope: NfseScope, requestId: string, recipientPartnerId?: string): Promise<NfseHomologationPreview>;
  issue(scope: NfseScope, requestId: string, previewId: string): Promise<NfseHomologationResult>;
  reconcile(scope: NfseScope, requestId: string, previewId: string): Promise<NfseHomologationResult>;
}
