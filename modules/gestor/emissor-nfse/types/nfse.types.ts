import type { NfseModelServiceOptions } from '../modelos/services/nfse-model-service-options';
import type { NfseModelPeopleOptions } from '../modelos/services/nfse-model-people-options';
import type { NfseModelValuesOptions } from '../modelos/services/nfse-model-values.types';
import type { NfseModelAdditionalOptions } from '../modelos/services/nfse-model-additional.types';
import type { NfseOperationReference } from '../emissao/nfse-operation.contract';

export type NfseEnvironment = 'HOMOLOGACAO' | 'PRODUCAO';
export type NfseTab = 'preparar' | 'pendentes' | 'emitidas' | 'canceladas' | 'erros' | 'modelos';

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

export type NfseIssTreatment = 'TRIBUTAVEL' | 'IMUNIDADE' | 'EXPORTACAO' | 'NAO_INCIDENCIA';

export interface NfseModelServiceFields {
  serviceOptions?: NfseModelServiceOptions | null;
  peopleOptions?: NfseModelPeopleOptions | null;
  valuesOptions?: NfseModelValuesOptions | null;
  additionalOptions?: NfseModelAdditionalOptions | null;
  serviceDescription: string;
  nationalServiceCode: string;
  nbsCode: string;
  operationIndicatorCode: string;
  issTreatment: NfseIssTreatment;
  immunityType: '1' | '2' | '3' | '4' | '5' | null;
  technicalResponsibilityDocument: string;
  referenceDocument: string;
  complementaryInfo: string;
  orderReference: string;
}

export interface NfseModel extends NfseModelServiceFields {
  id: string;
  name: string;
  active: boolean;
  version: number;
}

export interface NfseModelDescriptionPreview {
  description: string;
  monthLabel: string;
  usesReferenceMonth: boolean;
  requiresAcademicContext?: boolean;
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
export interface NfseDocument extends NfseOperationReference {
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
  emittedAt?: string | null;
  dateSource?: 'NFSE_DH_PROC' | null;
  origin?: 'ALUNO' | 'SERVICO' | null;
  courseType?: string | null;
  courseTypeLabel?: string | null;
  archivedAt?: string | null;
  canArchive?: boolean;
  canRestore?: boolean;
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
  issuedState?: 'ACTIVE' | 'CANCELLED';
  errorArchiveMode?: 'ACTIVE' | 'ARCHIVED';
  status: 'PENDENTE' | 'EMITIDA' | 'ERRO';
  search?: string;
  page?: number;
  dateFrom?: string;
  dateTo?: string;
  courseType?: string;
  origin?: 'ALUNO' | 'SERVICO' | '';
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

export interface NfseModelInput extends NfseModelServiceFields {
  requestId: string;
  id?: string;
  name: string;
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
