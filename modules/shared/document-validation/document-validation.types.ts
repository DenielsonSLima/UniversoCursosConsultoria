export type ValidatableDocumentType =
  | 'carteirinha'
  | 'cracha_estagio'
  | 'declaracao_matricula'
  | 'declaracao_frequencia'
  | 'declaracao_irpf'
  | 'boletim'
  | 'atestado_conclusao_tecnico'
  | 'historico_escolar'
  | 'transferencia'
  | 'rematricula'
  | 'termo_estagio'
  | 'certificado_tecnico'
  | 'certificado_livre'
  | 'certificado_ead'
  | 'certificado_especializacao';

export interface DocumentValidationPolicy {
  prefix: string;
  title: string;
}

export interface IssueDocumentInput {
  type: ValidatableDocumentType;
  enrollmentId: string;
  issuedBy?: string | null;
  expiresAt?: string | null;
  sourceReference?: string;
  referencePeriod?: string;
  registerReissue?: boolean;
}

export interface IssuedDocumentValidation {
  code: string;
  type: ValidatableDocumentType;
  issuedAt: string;
  expiresAt: string | null;
  lastIssuedAt?: string;
  issueCount?: number;
  reused?: boolean;
}
