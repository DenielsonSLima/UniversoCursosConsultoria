import { supabase } from '../../../../../lib/supabase';
import { AlunoDisponivel, EadAlunoTurma, EadPagamentoTurma, EadTurmaResumo, type EadTrustAccessStudent } from './ead-turma.types';
import { normalizeRpcList, normalizeRpcRecord } from './ead-rpc.utils';
import type { PublicCheckoutResult } from '../../../../asaas/checkout-result';
import type { EadEnrollmentInput, EadEnrollmentResult } from './ead-enrollment.model';

export const eadTurmaService = {
  async getResumo(turmaId: string): Promise<EadTurmaResumo> {
    const { data, error } = await supabase.rpc('ead_get_turma_dashboard', { p_turma_id: turmaId });
    if (error) throw error;
    return normalizeRpcRecord<EadTurmaResumo>(data, 'ead_get_turma_dashboard');
  },

  async getAlunos(turmaId: string, signal?: AbortSignal): Promise<EadAlunoTurma[]> {
    let request = supabase.rpc('ead_get_turma_alunos', { p_turma_id: turmaId });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return normalizeRpcList<EadAlunoTurma>(data, 'ead_get_turma_alunos');
  },

  async getTrustAccess(turmaId: string, signal?: AbortSignal): Promise<EadTrustAccessStudent[]> {
    let request = supabase.rpc('ead_get_turma_trust_access', { p_turma_id: turmaId });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return normalizeRpcList<EadTrustAccessStudent>(data, 'ead_get_turma_trust_access');
  },

  async getAlunosDisponiveis(turmaId: string, search: string): Promise<AlunoDisponivel[]> {
    const { data, error } = await supabase.rpc('ead_buscar_alunos_disponiveis', {
      p_turma_id: turmaId,
      p_search: search,
    });
    if (error) throw error;
    return normalizeRpcList<AlunoDisponivel>(data, 'ead_buscar_alunos_disponiveis');
  },

  async getPagamentos(turmaId: string): Promise<EadPagamentoTurma[]> {
    const { data, error } = await supabase
      .from('inscricoes_online')
      .select('id,matricula_id,nome,email,valor,status,pago_em,confirmado_em,forma_pagamento,created_at,updated_at,asaas_payment_id')
      .eq('turma_id', turmaId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return normalizeRpcList<EadPagamentoTurma>(data, 'inscricoes_online');
  },

  async adicionarAluno(turmaId: string, cursoId: string, input: EadEnrollmentInput): Promise<EadEnrollmentResult> {
    if (input.mode === 'GERAR_COBRANCA') {
      return { mode: input.mode, checkout: await eadTurmaService.matricularAlunoComCobranca(turmaId, cursoId, input.alunoId, input.requestId) };
    }
    if (input.mode !== 'SEM_COBRANCA') throw new Error('Escolha como adicionar o aluno.');
    const { data, error } = await supabase.rpc('ead_adicionar_aluno_sem_cobranca_secure', {
      p_turma_id: turmaId, p_aluno_id: input.alunoId, p_request_id: input.requestId, p_confirm: true,
    });
    if (error) throw new Error(error.message || 'Não foi possível adicionar o aluno sem cobrança.');
    if (data?.success !== true || data?.mode !== 'SEM_COBRANCA' || data?.status !== 'ATIVO' || !data?.matriculaId) {
      throw new Error('O servidor não confirmou a matrícula sem cobrança. Atualize a turma antes de tentar novamente.');
    }
    return { mode: 'SEM_COBRANCA', matriculaId: data.matriculaId, status: 'ATIVO', replayed: data.replayed === true };
  },

  async matricularAlunoComCobranca(turmaId: string, cursoId: string, alunoId: string, requestId: string = crypto.randomUUID()) {
    const { data, error } = await supabase.functions.invoke('payment-checkout', {
      body: {
        courseId: cursoId, alunoId, turmaId, managerEnrollment: true,
        requestId, method: 'BOLETO', installments: 1,
      },
    });
    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      throw new Error(body?.error || error.message || 'Não foi possível gerar a cobrança EAD.');
    }
    if (data?.error) throw new Error(data.error);
    if (!data?.matriculaId) throw new Error('O checkout não confirmou a matrícula EAD.');
    if (!data.receivableId && !data.alreadyPaid && !data.paymentReviewRequired) {
      throw new Error('O servidor não confirmou o financeiro EAD. Atualize a turma antes de tentar novamente.');
    }
    return data as PublicCheckoutResult;
  },
};
