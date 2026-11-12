import type { NfseScope } from '../../types/nfse.types';

export interface NfseFiscalReviewCheck { code: string; status: 'PASSED' | 'BLOCKED' | 'UNKNOWN'; message: string }
export interface NfseFiscalReview {
  documentId: string;
  revision: number;
  reviewStatus: 'NOT_REVIEWED' | 'CONFIRMED' | 'STALE' | 'BLOCKED';
  basisToken: string;
  reviewComplete: boolean;
  validationSource?: 'MANUAL' | 'SYSTEM_VALIDATED' | null;
  canTransmit: false;
  preparation: { studentName: string; classLabel: string; paymentMonth: string; amount: string; receiptCount: number;
    /** Revalidated receipt dates, never a saved fiscal date or a month boundary. */
    paymentDates?: string[];
    originalModel: { id: string; version: number; name: string; nationalServiceCode: string } };
  issuer: { name: string | null; cnpj: string; municipalityCode: string | null; municipalRegistration: string | null;
    opSimpNac: string | null; regEspTrib: string | null; regApTribSN: string | null; configurationVersion: number | null };
  recipient: { mode: 'STUDENT'; studentId: string; name: string | null; document: string | null;
    address: { street: string | null; number: string | null; complement: string | null; district: string | null;
      city: string | null; state: string | null; postalCode: string | null }; confirmed: boolean };
  service: { modelId: string | null; modelVersion: number | null; nationalServiceCode: string | null;
    nbsCode: string | null; description: string | null; issTreatment: string | null;
    competenceDate: string | null; serviceDate: string | null };
  checks: NfseFiscalReviewCheck[];
  savedAt: string | null;
  savedBy: string | null;
}

export interface NfseFiscalReviewDefinition {
  modelId: string;
  modelVersion: number;
  recipient: { mode: 'STUDENT'; confirmed: true };
  competenceDate: string;
  serviceDate: string;
  classificationConfirmed: true;
  receiptsConfirmed: true;
}
export interface SaveNfseFiscalReview {
  requestId: string; expectedRevision: number; basisToken: string; definition: NfseFiscalReviewDefinition;
}
export interface NfseFiscalReviewSaved { documentId: string; revision: number; reviewId: string; message: string }
export interface ValidateNfseFiscalReview {
  requestId: string; expectedRevision: number; basisToken: string; modelId: string; modelVersion: number;
}
export interface NfseFiscalReviewService {
  get(scope: NfseScope, documentId: string, modelId?: string, signal?: AbortSignal): Promise<NfseFiscalReview>;
  save(scope: NfseScope, documentId: string, input: SaveNfseFiscalReview): Promise<NfseFiscalReviewSaved>;
  validate(scope: NfseScope, documentId: string, input: ValidateNfseFiscalReview): Promise<NfseFiscalReviewSaved>;
}

