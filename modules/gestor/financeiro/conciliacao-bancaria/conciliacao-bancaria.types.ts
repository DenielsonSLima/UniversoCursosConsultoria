import type { GatewayEnvironment } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';

export type BaneseCnabReturnRecordStatus =
  | 'MATCHED'
  | 'REVIEW_REQUIRED'
  | 'RECORDED'
  | 'ACTIVATION_PENDING'
  | 'ACTIVATED'
  | 'ERROR'
  | 'SKIPPED';

export type BaneseCnabExchangeFileStatus =
  | 'CREATING'
  | 'GENERATED'
  | 'PREVIEWED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'PARTIAL'
  | 'REJECTED';

export interface BaneseCnabExchangeFile {
  id: string;
  direction: 'REMESSA' | 'RETORNO';
  fileName: string;
  environment: GatewayEnvironment;
  convenio?: string;
  status: BaneseCnabExchangeFileStatus;
  nsa?: number | null;
  titleCount: number;
  recordCount: number;
  totalAmount: number;
  generatedAt?: string | null;
  importedAt?: string | null;
  processedAt?: string | null;
  createdAt?: string | null;
}

export interface BaneseCnabEligibleReceivable {
  id: string;
  description: string;
  nominalAmount: number;
  dueDate: string;
  nossoNumero: string;
}

export interface BaneseCnabOverview {
  environment: GatewayEnvironment;
  convenio: string;
  edi7Configured: boolean;
  pixPolicy: string;
  eligibleReceivables: BaneseCnabEligibleReceivable[];
  files: BaneseCnabExchangeFile[];
}

export interface BaneseCnabRemittancePreviewItem {
  receivableId: string;
  description: string;
  dueDate: string;
  nominalAmount: number;
  nossoNumero: string;
  installmentNumber: number | null;
  installmentCount: number | null;
  financialTerms: {
    nominalAmount: number;
    dueDate: string;
    discount: null | {
      type: 'fixed' | 'percentage';
      value: number;
      validUntil: string;
    };
    penalty: null | {
      type: 'fixed' | 'percentage';
      value: number;
      startsOn: string;
    };
    interest: null | {
      type: 'daily-fixed' | 'monthly-percentage';
      value: number;
      startsOn: string;
    };
  };
  hasDiscount: boolean;
  hasPenalty: boolean;
  hasInterest: boolean;
}

export interface BaneseCnabRemittancePreviewInput {
  environment: GatewayEnvironment;
  receivableIds: string[];
}

export interface BaneseCnabRemittancePreviewResult {
  environment: GatewayEnvironment;
  convenio: string;
  titleCount: number;
  totalAmount: number;
  previewFingerprint: string;
  items: BaneseCnabRemittancePreviewItem[];
}

export interface BaneseCnabGenerateRemittanceInput extends BaneseCnabRemittancePreviewInput {
  previewFingerprint: string;
  confirmProduction: boolean;
}

export interface BaneseCnabGenerateRemittanceResult {
  file: BaneseCnabExchangeFile;
}

export interface BaneseCnabDownloadFileInput {
  environment: GatewayEnvironment;
  fileId: string;
}

export interface BaneseCnabDownloadFileResult {
  file: BaneseCnabExchangeFile;
  signedUrl: string;
  expiresIn: number;
}

export interface BaneseCnabDownloadedFileResult {
  file: BaneseCnabExchangeFile;
  blob: Blob;
  expiresIn: number;
}

export interface BaneseCnabReturnRecord {
  id: string;
  receivableId?: string | null;
  lineNumber: number;
  nossoNumero: string;
  movementCode?: string | null;
  occurrenceCodes: string[];
  nominalAmount?: number | null;
  paidAmount?: number | null;
  expectedMinAmount?: number | null;
  expectedMaxAmount?: number | null;
  occurrenceDate?: string | null;
  liquidationChannel?: string | null;
  status: BaneseCnabReturnRecordStatus;
  message?: string | null;
}

export interface BaneseCnabPreviewReturnInput {
  environment: GatewayEnvironment;
  fileName: string;
  fileSizeBytes: number;
  fileContentBase64: string;
}

export interface BaneseCnabPreviewReturnResult {
  duplicate: boolean;
  file: BaneseCnabExchangeFile;
  records: BaneseCnabReturnRecord[];
}

export interface BaneseCnabFileDetailsResult {
  file: BaneseCnabExchangeFile;
  records: BaneseCnabReturnRecord[];
}

export interface BaneseCnabFileInput {
  environment: GatewayEnvironment;
  fileId: string;
}

export type BaneseCnabGetFileInput = BaneseCnabFileInput;
export type BaneseCnabGetFileResult = BaneseCnabFileDetailsResult;
export type BaneseCnabRevalidateReturnInput = BaneseCnabApplyReturnInput;
export type BaneseCnabRevalidateReturnResult = BaneseCnabFileDetailsResult;

export interface BaneseCnabApplyReturnInput extends BaneseCnabFileInput {
  confirmProduction: boolean;
}

export interface BaneseCnabApplyReturnResult {
  alreadyProcessed: boolean;
  file: BaneseCnabExchangeFile;
  records: BaneseCnabReturnRecord[];
}

export type BaneseCnabRetryActivationInput = BaneseCnabApplyReturnInput;

export interface BaneseCnabRetryActivationResult {
  file: BaneseCnabExchangeFile;
  records: BaneseCnabReturnRecord[];
}

export interface BaneseCnabReturnSummary {
  events: number;
  matched: number;
  reviewRequired: number;
  applied: number;
  errors: number;
  skipped: number;
}
