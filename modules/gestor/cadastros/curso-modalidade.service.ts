import { supabase } from '../../../lib/supabase';
import { cadastrosService } from './cadastros.service';
import { Curso } from './cadastros.types';

export type CursoCadastroModalidade = 'LIVRE' | 'ESPECIALIZACAO';
export type CursoCadastroStatusFilter = 'ativo' | 'inativo';

export interface CreateCursoModalidadeInput {
  modalidade: CursoCadastroModalidade;
  nome: string;
  descricao: string;
  area: string;
  versao: string;
  cargaHoraria: number;
}

export const cursoModalidadeQueryKeys = {
  all: (modalidade: CursoCadastroModalidade) => ['cadastros', 'cursos', modalidade] as const,
  list: (modalidade: CursoCadastroModalidade) => [...cursoModalidadeQueryKeys.all(modalidade), 'list'] as const,
};

export const cursoModalidadeService = {
  async getCursos(modalidade: CursoCadastroModalidade): Promise<Curso[]> {
    return cadastrosService.getCursosByModalidade(modalidade);
  },

  async createCurso(input: CreateCursoModalidadeInput): Promise<Curso> {
    return cadastrosService.createCurso({
      nome: input.nome,
      carga_horaria: input.cargaHoraria,
      modalidade: input.modalidade,
      status: 'ativo',
      area: input.area,
      descricao: input.descricao,
      versao: input.versao
    });
  },

  async deleteCurso(cursoId: string): Promise<void> {
    await cadastrosService.deleteCurso(cursoId);
  },

  async duplicateCurso(cursoId: string, nome: string, versao: string): Promise<void> {
    await cadastrosService.duplicateCurso(cursoId, nome, versao);
  },

  async toggleStatus(cursoId: string, novoStatus: CursoCadastroStatusFilter): Promise<void> {
    await cadastrosService.toggleStatus(cursoId, novoStatus);
  },

  subscribeToModalidadeChanges(
    modalidade: CursoCadastroModalidade,
    onChange: () => void
  ) {
    const channel = supabase
      .channel(`cadastros_cursos_${modalidade.toLowerCase()}_realtime`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cursos', filter: `modalidade=eq.${modalidade}` },
        onChange
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas' }, onChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
