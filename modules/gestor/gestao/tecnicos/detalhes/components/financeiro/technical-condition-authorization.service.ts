import { supabase } from '../../../../../../../lib/supabase';
import type { CondicaoIndividualMotivo } from './matricula-tecnica-financeiro.types';

export interface TechnicalConditionCodeStatus {
  turmaId: string;
  configurado: boolean;
  revisao: number | null;
  atualizadoEm: string | null;
}

export interface ValidateTechnicalConditionCodeInput {
  turmaId: string;
  alunoId: string;
  codigo: string;
  motivo: CondicaoIndividualMotivo;
  justificativa?: string | null;
}

export interface ValidateTechnicalConditionCodeResult {
  autorizado: boolean;
  motivo: 'VALIDO' | 'INVALIDO' | 'BLOQUEADO' | 'NAO_CONFIGURADO';
  codigoRevisao?: number;
  tentativasRestantes?: number;
  bloqueadoAte?: string | null;
}

const requireObject = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
};

const unwrap = async <T>(
  promise: PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  parse: (value: unknown) => T,
) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message || 'O servidor não confirmou a operação.');
  return parse(data);
};

const parseStatus = (value: unknown): TechnicalConditionCodeStatus => {
  const source = requireObject(value, 'Status do código de autorização inválido.');
  if (typeof source.turmaId !== 'string' || typeof source.configurado !== 'boolean') {
    throw new Error('Status do código de autorização incompleto.');
  }
  return {
    turmaId: source.turmaId,
    configurado: source.configurado,
    revisao: source.revisao == null ? null : Number(source.revisao),
    atualizadoEm: typeof source.atualizadoEm === 'string' ? source.atualizadoEm : null,
  };
};

const parseValidation = (value: unknown): ValidateTechnicalConditionCodeResult => {
  const source = requireObject(value, 'Validação do código de autorização inválida.');
  const motivo = String(source.motivo || '') as ValidateTechnicalConditionCodeResult['motivo'];
  if (typeof source.autorizado !== 'boolean' || !['VALIDO', 'INVALIDO', 'BLOQUEADO', 'NAO_CONFIGURADO'].includes(motivo)) {
    throw new Error('Validação do código de autorização incompleta.');
  }
  return {
    autorizado: source.autorizado,
    motivo,
    codigoRevisao: source.codigoRevisao == null ? undefined : Number(source.codigoRevisao),
    tentativasRestantes: source.tentativasRestantes == null ? undefined : Number(source.tentativasRestantes),
    bloqueadoAte: typeof source.bloqueadoAte === 'string' ? source.bloqueadoAte : null,
  };
};

export const technicalConditionAuthorizationService = {
  getStatus(turmaId: string) {
    return unwrap(
      supabase.rpc('obter_status_codigo_condicao_individual_turma_tecnica_secure', { p_turma_id: turmaId }),
      parseStatus,
    );
  },

  validateCode(input: ValidateTechnicalConditionCodeInput) {
    return unwrap(
      supabase.rpc('validar_codigo_condicao_individual_turma_tecnica_secure', {
        p_turma_id: input.turmaId,
        p_aluno_id: input.alunoId,
        p_codigo: input.codigo,
        p_motivo: input.motivo,
        p_justificativa: input.justificativa || null,
      }),
      parseValidation,
    );
  },

  redefineCode(input: { turmaId: string; requestId: string; codigo: string; justificativa: string }) {
    return unwrap(
      supabase.rpc('redefinir_codigo_condicao_individual_turma_tecnica_secure', {
        p_turma_id: input.turmaId,
        p_request_id: input.requestId,
        p_novo_codigo: input.codigo,
        p_justificativa: input.justificativa,
      }),
      (value) => {
        const source = requireObject(value, 'Redefinição do código inválida.');
        return parseStatus(source.status);
      },
    );
  },
};
