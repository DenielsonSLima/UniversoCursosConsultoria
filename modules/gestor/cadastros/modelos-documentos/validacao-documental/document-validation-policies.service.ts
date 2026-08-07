import { supabase } from '../../../../../lib/supabase';
import type {
  DocumentValidationPolicy,
  DocumentValidationPolicyAuditRecord,
  DocumentValidationPolicyDraft,
} from './document-validation-policies.types';
import {
  PUBLIC_VALIDATION_FIELD_CATALOG,
  isPublicValidationFieldCompatible,
  normalizeVisibleFields,
} from '../../../../public/validator/validator.fields';
import { normalizeValidationPrefix } from './document-validation-policies.registry';

export const documentValidationPolicyKeys = {
  all: ['document-validation-policies'] as const,
  lists: () => [...documentValidationPolicyKeys.all, 'list'] as const,
  list: () => [...documentValidationPolicyKeys.lists(), 'global'] as const,
  details: () => [...documentValidationPolicyKeys.all, 'detail'] as const,
  detail: (documento: string) => [
    ...documentValidationPolicyKeys.details(),
    documento,
  ] as const,
  histories: () => [...documentValidationPolicyKeys.all, 'history'] as const,
  history: (documento: string) => [
    ...documentValidationPolicyKeys.histories(),
    documento,
  ] as const,
};

export const DOCUMENT_VALIDATION_POLICIES_STALE_TIME = 60_000;

export class DocumentValidationPolicyVersionConflictError extends Error {
  constructor() {
    super('Esta política foi atualizada por outra pessoa. Recarregue os dados antes de salvar.');
    this.name = 'DocumentValidationPolicyVersionConflictError';
  }
}

const normalizePolicy = (value: unknown): DocumentValidationPolicy => {
  const row = (value || {}) as Partial<DocumentValidationPolicy> & {
    versao?: number;
  };
  return {
    documento: String(row.documento || ''),
    prefixo: normalizeValidationPrefix(String(row.prefixo || 'DOC')),
    escopo_identidade: String(row.escopo_identidade || 'global'),
    validade_dias: row.validade_dias === null || row.validade_dias === undefined
      ? null
      : Number(row.validade_dias),
    exige_vinculo_ativo: Boolean(row.exige_vinculo_ativo),
    validacao_publica: row.validacao_publica !== false,
    consulta_publica_ativa: row.consulta_publica_ativa
      ?? row.validacao_publica
      ?? true,
    campos_publicos: normalizeVisibleFields(row.campos_publicos),
    versao_publica: Math.max(
      1,
      Number(row.versao_publica ?? row.versao ?? 1),
    ),
    updated_at: row.updated_at,
  };
};

const normalizeAuditRecord = (
  value: unknown,
): DocumentValidationPolicyAuditRecord => {
  const row = (value || {}) as Partial<DocumentValidationPolicyAuditRecord>;
  return {
    documento: String(row.documento || ''),
    versao: Math.max(1, Number(row.versao || 1)),
    prefixo: normalizeValidationPrefix(String(row.prefixo || 'DOC')),
    campos_publicos: normalizeVisibleFields(row.campos_publicos),
    consulta_publica_ativa: row.consulta_publica_ativa ?? true,
    validacao_publica: row.validacao_publica ?? true,
    validade_dias: row.validade_dias === null || row.validade_dias === undefined
      ? null
      : Number(row.validade_dias),
    ator_role: String(row.ator_role || 'unknown'),
    motivo: String(row.motivo || 'Alteração sem motivo informado'),
    created_at: String(row.created_at || ''),
  };
};

const isVersionConflict = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const searchable = `${record.code || ''} ${record.message || ''} ${record.details || ''}`.toLowerCase();
  return record.status === 409
    || record.code === '409'
    || record.code === '40001'
    || searchable.includes('versão')
    || searchable.includes('versao')
    || searchable.includes('version conflict');
};

export const documentValidationPoliciesService = {
  async getAll(): Promise<DocumentValidationPolicy[]> {
    const { data, error } = await (supabase.rpc as any)(
      'listar_politicas_validacao_documentos',
    );

    if (error) throw error;
    return (data || []).map(normalizePolicy);
  },

  async getByDocument(documento: string): Promise<DocumentValidationPolicy | null> {
    const policies = await this.getAll();
    return policies.find((policy) => policy.documento === documento) || null;
  },

  async getHistory(
    documento: string,
  ): Promise<DocumentValidationPolicyAuditRecord[]> {
    const { data, error } = await (supabase.rpc as any)(
      'listar_historico_politica_validacao_documento',
      { p_documento: documento },
    );

    if (error) throw error;
    return (data || [])
      .map(normalizeAuditRecord)
      .sort((
        left: DocumentValidationPolicyAuditRecord,
        right: DocumentValidationPolicyAuditRecord,
      ) => right.versao - left.versao);
  },

  async update(
    documento: string,
    draft: DocumentValidationPolicyDraft,
  ): Promise<DocumentValidationPolicy> {
    const validadeDias = draft.validacaoPublica && draft.validadeDias !== null
      ? Math.max(1, Math.min(3650, Math.trunc(draft.validadeDias)))
      : null;

    const { data, error } = await (supabase.rpc as any)(
      'atualizar_politica_validacao_documento_v2',
      {
        p_documento: documento,
        p_prefixo: normalizeValidationPrefix(draft.prefixo),
        p_validacao_publica: draft.validacaoPublica,
        p_validade_dias: validadeDias,
        p_consulta_publica_ativa: draft.consultaPublicaAtiva,
        p_campos_publicos: normalizeVisibleFields(draft.camposPublicos).filter((fieldId) => {
          const definition = PUBLIC_VALIDATION_FIELD_CATALOG.find(
            (field) => field.id === fieldId,
          );
          return definition
            ? isPublicValidationFieldCompatible(definition, documento)
            : false;
        }),
        p_expected_version: draft.versaoPublica,
        p_motivo: draft.motivo.trim(),
      },
    );

    if (error) {
      if (isVersionConflict(error)) {
        throw new DocumentValidationPolicyVersionConflictError();
      }
      throw error;
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | DocumentValidationPolicy
      | null;
    if (!row?.documento) {
      throw new Error('O banco não retornou a política documental atualizada.');
    }
    return normalizePolicy(row);
  },
};
