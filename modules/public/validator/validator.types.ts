import { ValidatableDocumentType } from '../../shared/document-validation/document-validation.types';
import type { PublicValidationField } from './validator.fields';

export type ValidationStatus = 'valid' | 'expired' | 'revoked' | 'invalid';

export type { ValidatableDocumentType };

export type AcademicDocumentValidationType = Exclude<
  ValidatableDocumentType,
  'carteirinha' | 'carteirinha_preceptor'
>;

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
  visibleFields: PublicValidationField[];
  schemaVersion: number;
}

export interface CarteirinhaValidationResult extends BaseValidationResult {
  type: 'carteirinha';
  enrollmentDate: string | null;
  estimatedValidity: string | null;
  registryMode: 'emission' | 'enrollment';
}

export interface AcademicDocumentValidationResult extends BaseValidationResult {
  type: AcademicDocumentValidationType;
  documentTitle: string;
  registryMode: 'emission';
}

/**
 * A credencial de preceptor não é um documento acadêmico do aluno. O contrato
 * público conserva os nomes de campos legados para compatibilidade com a RPC,
 * mas só expõe o nome do titular já mascarado e metadados da emissão.
 */
export interface CarteirinhaPreceptorValidationResult extends BaseValidationResult {
  type: 'carteirinha_preceptor';
  documentTitle: string;
  registryMode: 'emission';
}

export type DocumentValidationResult =
  | CarteirinhaValidationResult
  | CarteirinhaPreceptorValidationResult
  | AcademicDocumentValidationResult;
