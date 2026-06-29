import { supabase } from '../../../lib/supabase';
import { secretariaService } from '../../gestor/secretaria/secretaria.service';

export const alunoSecretariaKeys = {
  all: ['aluno-secretaria'] as const,
  aluno: (alunoId: string) => [...alunoSecretariaKeys.all, alunoId] as const,
  profile: (alunoId: string) => [...alunoSecretariaKeys.aluno(alunoId), 'profile'] as const,
  matriculas: (alunoId: string) => [...alunoSecretariaKeys.aluno(alunoId), 'matriculas'] as const,
  solicitacoes: (alunoId: string) => [...alunoSecretariaKeys.aluno(alunoId), 'solicitacoes'] as const,
  prazos: () => [...alunoSecretariaKeys.all, 'prazos'] as const,
};

export const alunoSecretariaService = {
  async getProfile(alunoId: string) {
    const { data, error } = await supabase
      .from('parceiros')
      .select('*')
      .eq('id', alunoId)
      .single();

    if (error) throw error;
    return data;
  },

  async getMatriculas(alunoId: string) {
    const { data, error } = await supabase
      .from('matriculas')
      .select('*, turmas(*, cursos(*), polos(nome))')
      .eq('aluno_id', alunoId)
      .order('data_matricula', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getPagamentosIrpf(alunoId: string, ano: string, turmaId?: string | null) {
    const { data, error } = await supabase.rpc('get_pagamentos_irpf_aluno', {
      p_aluno_id: alunoId,
      p_ano: ano,
      p_turma_id: turmaId || null,
    });

    if (error) throw error;
    return data || [];
  },

  getSolicitacoes: (alunoId: string) => secretariaService.getSolicitacoesByAluno(alunoId),
  getPrazos: () => secretariaService.getPrazos(),
  createSolicitacao: secretariaService.createSolicitacao,
};
