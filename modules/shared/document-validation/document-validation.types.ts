export type ValidatableDocumentType =
  | 'carteirinha'
  | 'carteirinha_preceptor'
  | 'cracha_estagio'
  | 'contrato_aluno'
  | 'declaracao_matricula'
  | 'declaracao_frequencia'
  | 'declaracao_irpf'
  | 'boletim'
  | 'atestado_conclusao_tecnico'
  | 'historico_escolar'
  | 'transferencia'
  | 'termo_estagio'
  | 'certificado_tecnico'
  | 'certificado_livre'
  | 'certificado_ead'
  | 'certificado_especializacao'
  | 'diario_classe'
  | 'pasta_identificacao'
  | 'ficha_matricula';

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
  idempotencyKey?: string;
  registerReissue?: boolean;
}

export interface IssueDocumentBatchInput
  extends Omit<IssueDocumentInput, 'enrollmentId'> {
  enrollmentIds: string[];
}

export interface ReissueDocumentInput
  extends Omit<IssueDocumentInput, 'idempotencyKey' | 'registerReissue'> {
  idempotencyKey: string;
}

export interface ReissueDocumentBatchInput
  extends Omit<IssueDocumentBatchInput, 'idempotencyKey' | 'registerReissue'> {
  idempotencyKey: string;
}

export interface IssuedDocumentValidation {
  code: string;
  type: ValidatableDocumentType;
  issuedAt: string;
  expiresAt: string | null;
  validationPublic: boolean;
  lastIssuedAt?: string;
  issueCount?: number;
  reused?: boolean;
}

export interface PreparedDocumentReissue extends IssuedDocumentValidation {
  policyVersion: number;
}
