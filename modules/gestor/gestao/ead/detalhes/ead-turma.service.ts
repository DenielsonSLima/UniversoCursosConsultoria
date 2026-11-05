import { supabase } from '../../../../../lib/supabase';
import { AlunoDisponivel, EadAlunoTurma, EadPagamentoTurma, EadTurmaResumo } from './ead-turma.types';
import { normalizeRpcList, normalizeRpcRecord } from './ead-rpc.utils';
import type { PublicCheckoutResult } from '../../../../asaas/checkout-result';

export const eadTurmaService = {
  async getResumo(turmaId: string): Promise<EadTurmaResumo> {
    const { data, error } = await supabase.rpc('ead_get_turma_dashboard', { p_turma_id: turmaId });
    if (error) throw error;
    return normalizeRpcRecord<EadTurmaResumo>(data, 'ead_get_turma_dashboard');
  },

  async getAlunos(turmaId: string): Promise<EadAlunoTurma[]> {
    const { data, error } = await supabase.rpc('ead_get_turma_alunos', { p_turma_id: turmaId });
    if (error) throw error;
    return normalizeRpcList<EadAlunoTurma>(data, 'ead_get_turma_alunos');
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

  async matricularAlunoComCobranca(turmaId: string, cursoId: string, alunoId: string) {
    const { data, error } = await supabase.functions.invoke('payment-checkout', {
      body: {
        courseId: cursoId, alunoId, turmaId, managerEnrollment: true,
        requestId: crypto.randomUUID(), method: 'BOLETO', installments: 1,
      },
    });
    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      throw new Error(body?.error || error.message || 'Não foi possível gerar a cobrança EAD.');
    }
    if (data?.error) throw new Error(data.error);
    if (!data?.matriculaId) throw new Error('O checkout não confirmou a matrícula EAD.');
    return data as PublicCheckoutResult;
  },
};
