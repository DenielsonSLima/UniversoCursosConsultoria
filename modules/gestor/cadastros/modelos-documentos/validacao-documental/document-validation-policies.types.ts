import type { PublicValidationField } from '../../../../public/validator/validator.fields';
import type { ValidatableDocumentType } from '../../../../shared/document-validation/document-validation.types';

export interface DocumentValidationPolicy {
  documento: string;
  prefixo: string;
  escopo_identidade: string;
  validade_dias: number | null;
  exige_vinculo_ativo: boolean;
  validacao_publica: boolean;
  consulta_publica_ativa: boolean;
  campos_publicos: PublicValidationField[];
  versao_publica: number;
  updated_at?: string;
}

export interface DocumentValidationPolicyDraft {
  prefixo: string;
  validacaoPublica: boolean;
  consultaPublicaAtiva: boolean;
  validadeDias: number | null;
  camposPublicos: PublicValidationField[];
  versaoPublica: number;
  motivo: string;
}

export interface DocumentValidationPolicyAuditRecord {
  documento: string;
  versao: number;
  prefixo: string;
  campos_publicos: PublicValidationField[];
  consulta_publica_ativa: boolean;
  validacao_publica: boolean;
  validade_dias: number | null;
  ator_role: string;
  motivo: string;
  created_at: string;
}

export interface DocumentValidationCatalogItem {
  id: ValidatableDocumentType;
  label: string;
  description: string;
  group: 'Identificação' | 'Declarações' | 'Registros acadêmicos' | 'Certificados' | 'Fichas cadastrais';
  validityMode?: 'class_end';
}

export interface NonValidatableDocumentCatalogItem {
  id: string;
  label: string;
  reason: string;
}
