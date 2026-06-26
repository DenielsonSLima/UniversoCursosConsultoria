import { ValidatableDocumentType } from '../../shared/document-validation/document-validation.types';

export type ValidationStatus = 'valid' | 'expired' | 'revoked' | 'invalid';

export type { ValidatableDocumentType };

export interface BaseValidationResult {
  type: ValidatableDocumentType;
  status: ValidationStatus;
  code: string;
  studentName: string;
  studentPhotoUrl: string | null;
  maskedCpf: string;
  maskedBirthDate: string;
  maskedMotherName: string;
  maskedEnrollmentNumber: string;
  courseName: string;
  className: string;
  institutionName: string;
  institutionCnpj: string;
  unitName: string;
  enrollmentStatus: string;
  issuedAt: string | null;
  lastIssuedAt: string | null;
  expiresAt: string | null;
  enrollmentDate?: string | null;
  referencePeriod: string | null;
  issueCount: number | null;
}

export interface CarteirinhaValidationResult extends BaseValidationResult {
  type: 'carteirinha';
  enrollmentDate: string | null;
  estimatedValidity: string | null;
  registryMode: 'emission' | 'enrollment';
}

export interface AcademicDocumentValidationResult extends BaseValidationResult {
  type:
    | 'declaracao_matricula'
    | 'declaracao_frequencia'
    | 'boletim'
    | 'atestado_conclusao_tecnico'
    | 'declaracao_irpf'
    | 'historico_escolar'
    | 'transferencia'
    | 'cracha_estagio'
    | 'rematricula'
    | 'termo_estagio'
    | 'certificado_tecnico'
    | 'certificado_livre'
    | 'certificado_ead'
    | 'certificado_especializacao';
  documentTitle: string;
  registryMode: 'emission';
}

export type DocumentValidationResult =
  | CarteirinhaValidationResult
  | AcademicDocumentValidationResult;
