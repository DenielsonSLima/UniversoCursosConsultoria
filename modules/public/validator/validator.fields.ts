import type { ValidatableDocumentType } from './validator.types';

export const PUBLIC_VALIDATION_FIELDS = [
  'studentName',
  'studentPhotoUrl',
  'studentCpf',
  'studentBirthDate',
  'maskedMotherName',
  'maskedEnrollmentNumber',
  'courseName',
  'className',
  'institutionName',
  'institutionCnpj',
  'unitName',
  'enrollmentStatus',
  'issuedAt',
  'lastIssuedAt',
  'expiresAt',
  'referencePeriod',
  'issueCount',
  'enrollmentDate',
] as const;

export type PublicValidationField = typeof PUBLIC_VALIDATION_FIELDS[number];
export type PublicValidationFieldGroup =
  | 'Identificação'
  | 'Dados acadêmicos'
  | 'Instituição'
  | 'Emissão';
export type PublicValidationFieldRisk = 'baixo' | 'moderado' | 'sensível';

export interface PublicValidationFieldDefinition {
  id: PublicValidationField;
  label: string;
  description: string;
  group: PublicValidationFieldGroup;
  risk: PublicValidationFieldRisk;
  masked: boolean;
  required?: boolean;
  compatibleWith?: readonly ValidatableDocumentType[];
}

export const REQUIRED_PUBLIC_VALIDATION_FIELDS = [
  'institutionName',
  'issuedAt',
] as const satisfies readonly PublicValidationField[];

const PHOTO_DOCUMENT_TYPES = ['carteirinha', 'cracha_estagio'] as const;
const REFERENCE_DOCUMENT_TYPES = [
  'declaracao_frequencia',
  'declaracao_irpf',
  'boletim',
  'termo_estagio',
] as const;
const DIARY_PUBLIC_FIELDS = new Set<PublicValidationField>([
  'courseName',
  'className',
  'institutionName',
  'institutionCnpj',
  'unitName',
  'issuedAt',
  'lastIssuedAt',
  'expiresAt',
  'issueCount',
]);
const CONTRACT_PUBLIC_FIELDS = new Set<PublicValidationField>([
  'studentName',
  'courseName',
  'className',
  'institutionName',
  'institutionCnpj',
  'unitName',
  'issuedAt',
  'lastIssuedAt',
  'expiresAt',
  'issueCount',
]);
const PRECEPTOR_PUBLIC_FIELDS = new Set<PublicValidationField>([
  'studentName',
  'institutionName',
  'institutionCnpj',
  'unitName',
  'issuedAt',
  'lastIssuedAt',
  'expiresAt',
  'issueCount',
]);

export const PUBLIC_VALIDATION_FIELD_CATALOG: readonly PublicValidationFieldDefinition[] = [
  { id: 'studentName', label: 'Nome do titular (mascarado)', description: 'Primeiro nome legível e demais nomes protegidos.', group: 'Identificação', risk: 'sensível', masked: true },
  { id: 'studentPhotoUrl', label: 'Foto do estudante', description: 'Disponível somente para documentos de identificação.', group: 'Identificação', risk: 'sensível', masked: false, compatibleWith: PHOTO_DOCUMENT_TYPES },
  { id: 'studentCpf', label: 'CPF mascarado', description: 'Nunca exibe o CPF completo.', group: 'Identificação', risk: 'sensível', masked: true },
  { id: 'studentBirthDate', label: 'Ano de nascimento', description: 'Dia e mês permanecem ocultos.', group: 'Identificação', risk: 'sensível', masked: true },
  { id: 'maskedMotherName', label: 'Nome da mãe mascarado', description: 'Mantém somente o mínimo necessário para conferência.', group: 'Identificação', risk: 'sensível', masked: true },
  { id: 'maskedEnrollmentNumber', label: 'Matrícula mascarada', description: 'Nunca exibe a matrícula completa.', group: 'Identificação', risk: 'sensível', masked: true },
  { id: 'courseName', label: 'Curso', description: 'Nome do curso associado à emissão.', group: 'Dados acadêmicos', risk: 'moderado', masked: false },
  { id: 'className', label: 'Turma', description: 'Turma associada à emissão.', group: 'Dados acadêmicos', risk: 'moderado', masked: false },
  { id: 'enrollmentStatus', label: 'Situação da matrícula', description: 'Situação acadêmica congelada no momento da emissão.', group: 'Dados acadêmicos', risk: 'moderado', masked: false },
  { id: 'institutionName', label: 'Instituição emissora', description: 'Identificação obrigatória da instituição.', group: 'Instituição', risk: 'baixo', masked: false, required: true },
  { id: 'institutionCnpj', label: 'CNPJ da instituição', description: 'CNPJ público da instituição emissora.', group: 'Instituição', risk: 'baixo', masked: false },
  { id: 'unitName', label: 'Polo ou unidade', description: 'Unidade responsável pela emissão.', group: 'Instituição', risk: 'baixo', masked: false },
  { id: 'issuedAt', label: 'Data de emissão', description: 'Informação obrigatória de rastreabilidade.', group: 'Emissão', risk: 'baixo', masked: false, required: true },
  { id: 'lastIssuedAt', label: 'Última emissão', description: 'Data da última emissão ou reemissão.', group: 'Emissão', risk: 'baixo', masked: false },
  { id: 'expiresAt', label: 'Data de validade', description: 'Data calculada pelo backend, quando aplicável.', group: 'Emissão', risk: 'baixo', masked: false },
  { id: 'referencePeriod', label: 'Período de referência', description: 'Exibido apenas em documentos com período próprio.', group: 'Emissão', risk: 'moderado', masked: false, compatibleWith: REFERENCE_DOCUMENT_TYPES },
  { id: 'issueCount', label: 'Quantidade de emissões', description: 'Contador de emissão e reemissões.', group: 'Emissão', risk: 'baixo', masked: false },
  { id: 'enrollmentDate', label: 'Data de matrícula', description: 'Data do vínculo acadêmico.', group: 'Dados acadêmicos', risk: 'moderado', masked: false },
] as const;

const publicFieldSet = new Set<string>(PUBLIC_VALIDATION_FIELDS);
const requiredFieldSet = new Set<PublicValidationField>(REQUIRED_PUBLIC_VALIDATION_FIELDS);

export const isPublicValidationField = (
  value: unknown,
): value is PublicValidationField => (
  typeof value === 'string' && publicFieldSet.has(value)
);

export const normalizeVisibleFields = (value: unknown): PublicValidationField[] => {
  // Ausência de perfil nunca pode ampliar a exposição pública. O mapper trata
  // contratos v1 separadamente, usando este mesmo perfil mínimo seguro.
  const selected = Array.isArray(value)
    ? value.filter(isPublicValidationField)
    : [...REQUIRED_PUBLIC_VALIDATION_FIELDS];
  return [...new Set<PublicValidationField>([
    ...selected,
    ...REQUIRED_PUBLIC_VALIDATION_FIELDS,
  ])];
};

/**
 * Alguns documentos têm uma política de privacidade mais restrita do que o
 * catálogo genérico. O contrato e a credencial de preceptor nunca podem
 * publicar foto, CPF, data de nascimento, filiação ou número de matrícula.
 */
export const isPublicValidationFieldAllowedForDocument = (
  field: PublicValidationField,
  documentType: ValidatableDocumentType,
): boolean => {
  if (documentType === 'diario_classe') {
    return DIARY_PUBLIC_FIELDS.has(field);
  }
  if (documentType === 'contrato_aluno') {
    return CONTRACT_PUBLIC_FIELDS.has(field);
  }
  if (documentType === 'carteirinha_preceptor') {
    return PRECEPTOR_PUBLIC_FIELDS.has(field);
  }
  return true;
};

export const isPublicValidationFieldCompatible = (
  field: PublicValidationFieldDefinition,
  documentType: string,
): boolean => (
  !isPublicValidationFieldAllowedForDocument(
    field.id,
    documentType as ValidatableDocumentType,
  )
    ? false
    : (
      !field.compatibleWith
      || field.compatibleWith.includes(documentType as ValidatableDocumentType)
    )
);

export const isValidationFieldVisible = (
  visibleFields: readonly PublicValidationField[],
  field: PublicValidationField,
): boolean => requiredFieldSet.has(field) || visibleFields.includes(field);
