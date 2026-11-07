export type NfseEnvironment = 'HOMOLOGACAO' | 'PRODUCAO';
export type NfseTab = 'preparar' | 'pendentes' | 'emitidas' | 'erros' | 'modelos';

/** Cache/request correlation only. The server must authorize the actual session. */
export interface NfseScope {
  poloId: string;
  contextKey: string;
  environment: NfseEnvironment;
  month: string;
}

export interface NfseCapabilities {
  prepare: boolean;
  manageModels: boolean;
  issue: boolean;
  retry: boolean;
  configure: boolean;
}

export interface NfseReadiness {
  status: 'READY' | 'BLOCKED';
  message: string;
}

/** Money is a canonical decimal string. null means unknown, never zero. */
export type NfseMoney = string | null;

export interface NfseModel {
  id: string;
  name: string;
  serviceDescription: string;
  nationalServiceCode: string;
  active: boolean;
  version: number;
}

export interface NfseWorkspace {
  capabilities: NfseCapabilities;
  readiness: NfseReadiness;
  summary: {
    receivedAmount: NfseMoney;
    preparedAmount: NfseMoney;
    pendingCount: number | null;
    issuedCount: number | null;
    errorCount: number | null;
  };
  classes: { id: string; label: string }[];
  models: NfseModel[];
}

export interface NfseCandidate {
  id: string;
  studentName: string;
  enrollmentId: string;
  classId: string;
  classLabel: string;
  receivedAmount: NfseMoney;
  serviceAmount: NfseMoney;
  eligible: boolean;
  blockingReason: string | null;
}

export type NfseDocumentStatus = 'PENDENTE' | 'EM_PROCESSAMENTO' | 'AGUARDANDO_CONFIRMACAO' | 'EMITIDA' | 'ERRO';
export interface NfseDocument {
  id: string;
  studentName: string;
  classLabel: string;
  amount: NfseMoney;
  modelLabel: string;
  status: NfseDocumentStatus;
  number: string | null;
  accessKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
}

export interface NfsePage<T> {
  rows: T[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export interface NfseCandidateFilters {
  classId?: string;
  modelId?: string;
  search?: string;
  page?: number;
}

export interface NfseDocumentFilters {
  status: 'PENDENTE' | 'EMITIDA' | 'ERRO';
  search?: string;
  page?: number;
}

export interface NfseConfiguration {
  poloId: string;
  cnpj: string;
  municipalityCode: string | null;
  municipalRegistration: string | null;
  portalAccess: 'PASSWORD' | 'CERTIFICATE' | 'GOVBR';
  credentialSource: 'MATRIZ' | 'PROPRIO';
  environment: NfseEnvironment;
  certificate: { configured: boolean; subject: string | null; expiresAt: string | null };
  portalLoginConfigured: boolean;
  readiness: NfseReadiness;
  canManage: boolean;
}

export interface NfseConfigurationInput {
  requestId: string;
  municipalityCode: string;
  municipalRegistration: string;
  portalAccess: NfseConfiguration['portalAccess'];
  credentialSource: NfseConfiguration['credentialSource'];
  environment: NfseEnvironment;
}

export interface NfsePrepareInput {
  requestId: string;
  candidateIds: string[];
  modelId: string;
}

export interface NfseModelInput {
  requestId: string;
  id?: string;
  name: string;
  serviceDescription: string;
  nationalServiceCode: string;
  active: boolean;
  expectedVersion?: number;
}

export interface NfseMutationResult {
  id: string;
  version: number;
  message: string;
}

export interface NfseEnvelope<T> {
  version: 1;
  scope: NfseScope;
  data: T;
}
