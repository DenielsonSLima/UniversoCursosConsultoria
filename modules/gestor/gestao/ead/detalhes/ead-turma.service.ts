import { supabase } from '../../../../../lib/supabase';
import { AlunoDisponivel, EadAlunoTurma, EadPagamentoTurma, EadTurmaResumo } from './ead-turma.types';

export const eadTurmaService = {
  async getResumo(turmaId: string): Promise<EadTurmaResumo> {
    const { data, error } = await supabase.rpc('ead_get_turma_dashboard', { p_turma_id: turmaId });
    if (error) throw error;
    return data as EadTurmaResumo;
  },

  async getAlunos(turmaId: string): Promise<EadAlunoTurma[]> {
    const { data, error } = await supabase.rpc('ead_get_turma_alunos', { p_turma_id: turmaId });
    if (error) throw error;
    return data as EadAlunoTurma[];
  },

  async getAlunosDisponiveis(turmaId: string, search: string): Promise<AlunoDisponivel[]> {
    const { data, error } = await supabase.rpc('ead_buscar_alunos_disponiveis', {
      p_turma_id: turmaId,
      p_search: search,
    });
    if (error) throw error;
    return data as AlunoDisponivel[];
  },

  async getPagamentos(turmaId: string): Promise<EadPagamentoTurma[]> {
    const { data, error } = await supabase
      .from('inscricoes_online')
      .select('id,matricula_id,nome,email,valor,status,pago_em,confirmado_em,forma_pagamento,created_at,updated_at,asaas_payment_id')
      .eq('turma_id', turmaId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data as EadPagamentoTurma[];
  },

  async liberarMatricula(matriculaId: string) {
    const { error } = await supabase.rpc('ead_liberar_matricula', { p_matricula_id: matriculaId });
    if (error) throw error;
  },

  async matricularAlunoManual(turmaId: string, alunoId: string) {
    const { error } = await supabase.rpc('ead_matricular_aluno_manual', {
      p_turma_id: turmaId,
      p_aluno_id: alunoId,
    });
    if (error) throw error;
  },
};
