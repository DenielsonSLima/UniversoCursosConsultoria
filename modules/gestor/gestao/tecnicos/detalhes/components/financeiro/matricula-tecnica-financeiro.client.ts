import { supabase } from '../../../../../../../lib/supabase';
import type {
  AtivarFinanceiroMatriculaTecnicaInput,
  AtivarFinanceiroMatriculaTecnicaResult,
  AtivarFinanceiroMatriculasTecnicasLoteInput,
  AtivarFinanceiroMatriculasTecnicasLoteResult,
  AlterarOverrideFinanceiroTecnicoResult,
  MatriculaTecnicaFinanceiroWorkspace,
  MatriculaTecnicaRegra,
  PreVinculoAlunoTecnicoContexto,
  PreVincularAlunoTecnicoInput,
  PreVincularAlunoTecnicoResult,
  PreverRegraFinanceiraTecnicaInput,
  RemoverOverrideFinanceiroTecnicoInput,
  SalvarOverrideFinanceiroTecnicoInput,
  SalvarRegraFinanceiraTecnicaInput,
  SalvarRegraFinanceiraTecnicaResult,
} from './matricula-tecnica-financeiro.types';
import {
  validateAtivacaoLoteInput,
  validateAtivacaoLoteResult,
} from './matricula-tecnica-financeiro.validation';

type ContractParser<T> = (value: unknown) => T;
type ContractUnwrap = <T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  parser: ContractParser<T>,
) => Promise<T>;

interface FinanceiroClientParsers {
  unwrap: ContractUnwrap;
  requirePreVinculoContexto: ContractParser<PreVinculoAlunoTecnicoContexto>;
  requireWorkspace: ContractParser<MatriculaTecnicaFinanceiroWorkspace>;
  requireRegra: ContractParser<MatriculaTecnicaRegra>;
  requireSalvarRegra: ContractParser<SalvarRegraFinanceiraTecnicaResult>;
  requireAlterarOverrideAutorizado: ContractParser<AlterarOverrideFinanceiroTecnicoResult>;
  requirePreVinculo: ContractParser<PreVincularAlunoTecnicoResult>;
  requireAtivacao: ContractParser<AtivarFinanceiroMatriculaTecnicaResult>;
  requireAtivacaoLote: ContractParser<AtivarFinanceiroMatriculasTecnicasLoteResult>;
}

export const createMatriculaTecnicaFinanceiroService = ({
  unwrap,
  requirePreVinculoContexto,
  requireWorkspace,
  requireRegra,
  requireSalvarRegra,
  requireAlterarOverrideAutorizado,
  requirePreVinculo,
  requireAtivacao,
  requireAtivacaoLote,
}: FinanceiroClientParsers) => ({
  getPreVinculoContexto(turmaId: string, alunoId: string) {
    return unwrap(
      supabase.rpc('obter_pre_vinculo_aluno_tecnico_contexto_secure', {
        p_turma_id: turmaId,
        p_aluno_id: alunoId,
      }),
      requirePreVinculoContexto,
    );
  },

  getWorkspace(turmaId: string, alunoId?: string | null) {
    return unwrap(
      supabase.rpc('obter_financeiro_matricula_tecnica_workspace_secure', {
        p_turma_id: turmaId,
        p_aluno_id: alunoId || null,
      }),
      requireWorkspace,
    );
  },

  previewRegra(input: PreverRegraFinanceiraTecnicaInput) {
    return unwrap(
      supabase.rpc('prever_regra_financeira_turma_tecnica_secure', {
        p_turma_id: input.turmaId,
        p_regra: input.regra,
      }),
      requireRegra,
    );
  },

  async salvarRegra(input: SalvarRegraFinanceiraTecnicaInput) {
    const result = await unwrap(
      supabase.rpc('salvar_regra_financeira_turma_tecnica_secure', {
        p_turma_id: input.turmaId,
        p_request_id: input.requestId,
        p_expected_revisao: input.expectedRevisao,
        p_expected_fingerprint: input.expectedFingerprint,
        p_regra: input.regra,
      }),
      requireSalvarRegra,
    );
    if (
      result.requestId !== input.requestId
      || result.workspace.turma.turmaId !== input.turmaId
      || result.regra.identidade.turmaFingerprint
        !== result.workspace.regra.identidade.turmaFingerprint
    ) throw new Error('O servidor não reconciliou a regra financeira salva.');
    return result;
  },

  async salvarOverride(input: SalvarOverrideFinanceiroTecnicoInput) {
    const result = await unwrap(
      supabase.rpc('salvar_override_financeiro_matricula_tecnica_autorizado_secure', {
        p_matricula_id: input.matriculaId,
        p_request_id: input.requestId,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_override_revisao: input.expectedOverrideRevisao,
        p_expected_override_fingerprint: input.expectedOverrideFingerprint,
        p_override: input.override,
        p_codigo: input.codigoAutorizacao,
        p_motivo: input.motivo,
        p_justificativa: input.justificativa || null,
      }),
      requireAlterarOverrideAutorizado,
    );
    if (
      result.operacao !== 'SALVAR_OVERRIDE_MATRICULA'
      || result.requestId !== input.requestId
      || result.matriculaId !== input.matriculaId
      || result.matricula.matriculaId !== input.matriculaId
      || result.workspace.turma.turmaId !== input.turmaId
    ) throw new Error('O servidor não reconciliou o override financeiro salvo.');
    return result;
  },

  async removerOverride(input: RemoverOverrideFinanceiroTecnicoInput) {
    const result = await unwrap(
      supabase.rpc('remover_override_financeiro_matricula_tecnica_autorizado_secure', {
        p_matricula_id: input.matriculaId,
        p_request_id: input.requestId,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_override_revisao: input.expectedOverrideRevisao,
        p_expected_override_fingerprint: input.expectedOverrideFingerprint,
        p_codigo: input.codigoAutorizacao,
        p_motivo: input.motivo,
        p_justificativa: input.justificativa || null,
      }),
      requireAlterarOverrideAutorizado,
    );
    if (
      result.operacao !== 'REMOVER_OVERRIDE_MATRICULA'
      || result.requestId !== input.requestId
      || result.matriculaId !== input.matriculaId
      || result.matricula.matriculaId !== input.matriculaId
      || result.workspace.turma.turmaId !== input.turmaId
    ) throw new Error('O servidor não reconciliou a remoção do override financeiro.');
    return result;
  },

  async preVincular(input: PreVincularAlunoTecnicoInput) {
    const result = await unwrap(
      supabase.rpc('pre_vincular_aluno_tecnico_secure', {
        p_turma_id: input.turmaId,
        p_aluno_id: input.alunoId,
        p_request_id: input.requestId,
        p_expected_regra_revisao: input.expectedRegraRevisao,
        p_expected_regra_fingerprint: input.expectedRegraFingerprint,
        p_primeiro_vencimento: input.primeiroVencimento || null,
      }),
      requirePreVinculo,
    );
    if (
      result.requestId !== input.requestId
      || result.matricula.alunoId !== input.alunoId
      || result.matricula.financeiro.status !== 'PENDENTE'
      || result.matricula.financeiro.titulo !== null
      || result.regraAplicada.revisao !== input.expectedRegraRevisao
      || result.regraAplicada.fingerprint !== input.expectedRegraFingerprint
    ) throw new Error('O servidor não reconciliou o pré-vínculo solicitado.');
    return result;
  },

  async ativarIndividual(input: AtivarFinanceiroMatriculaTecnicaInput) {
    const result = await unwrap(
      supabase.rpc('ativar_financeiro_matricula_tecnica_flexivel_secure', {
        p_matricula_id: input.matriculaId,
        p_modo: input.modo,
        p_request_id: input.requestId,
        p_ativar_em: input.ativarEm || null,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_override_revisao: input.expectedOverrideRevisao,
        p_expected_override_fingerprint: input.expectedOverrideFingerprint,
        p_expected_efetiva_fingerprint: input.expectedEfetivaFingerprint,
      }),
      requireAtivacao,
    );
    const expectedStatus = input.modo === 'AGORA' ? 'GERADA' : 'AGENDADA';
    if (
      result.requestId !== input.requestId
      || result.modo !== input.modo
      || result.matricula.matriculaId !== input.matriculaId
      || !(
        result.matricula.financeiro.status === expectedStatus
        || (input.modo === 'AGORA' && result.matricula.financeiro.status === 'ATIVADA')
      )
      || result.regraAplicada.identidade.turmaRevisao !== input.expectedTurmaRevisao
      || result.regraAplicada.identidade.turmaFingerprint !== input.expectedTurmaFingerprint
      || result.regraAplicada.identidade.efetivaFingerprint !== input.expectedEfetivaFingerprint
      || result.matricula.override?.identidade.revisao !== input.expectedOverrideRevisao
      || result.matricula.override?.identidade.fingerprint !== input.expectedOverrideFingerprint
      || (
        input.modo === 'AGORA'
        && result.matricula.financeiro.status === 'GERADA'
        && result.matricula.financeiro.titulo === null
      )
      || (
        input.modo === 'AGORA'
        && result.matricula.financeiro.status === 'ATIVADA'
        && result.matricula.financeiro.titulo !== null
      )
      || (input.modo === 'AGENDADA' && result.matricula.financeiro.titulo !== null)
      || result.workspace.turma.turmaId !== input.turmaId
    ) throw new Error('O servidor não reconciliou a ativação financeira solicitada.');
    return result;
  },

  async ativarLote(input: AtivarFinanceiroMatriculasTecnicasLoteInput) {
    validateAtivacaoLoteInput(input);
    const result = await unwrap(
      supabase.rpc('ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure', {
        p_turma_id: input.turmaId,
        p_matricula_ids: input.matriculaIds,
        p_modo: input.modo,
        p_request_id: input.requestId,
        p_ativar_em: input.ativarEm || null,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_regras: input.expectedRegras,
      }),
      requireAtivacaoLote,
    );
    validateAtivacaoLoteResult(input, result);
    return result;
  },
});
