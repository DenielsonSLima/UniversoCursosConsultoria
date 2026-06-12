// File: modules/gestor/gestao/gestao.service.ts

import { Turma } from './gestao.types';
import { supabase } from '../../../lib/supabase';

export const gestaoService = {
  async getTurmasByModalidade(modalidade: string): Promise<Turma[]> {
    const { data, error } = await supabase
      .from('turmas')
      .select('*, cursos!inner(*), polos(nome), matriculas(status)')
      .eq('cursos.modalidade', modalidade);

    if (error) {
      console.error('Erro ao buscar turmas por modalidade:', error);
      throw error;
    }

    return (data || []).map((t: any) => {
      const matriculas = t.matriculas || [];
      const alunosMatriculados = matriculas.length;
      const alunosAtivos = matriculas.filter((m: any) => m.status === 'ativo').length;
      const alunosInativos = matriculas.filter((m: any) => m.status !== 'ativo').length;

      return {
        id: t.id,
        codigo: t.codigo,
        nome: t.nome,
        cursoId: t.curso_id,
        cursoNome: t.cursos?.nome || '',
        modalidade: t.cursos?.modalidade || 'TECNICO',
        poloId: t.polo_id,
        poloNome: t.polos?.nome || 'Matriz - Aracaju',
        dataInicio: t.data_inicio,
        dataPrevisaoTermino: t.data_previsao_termino,
        turno: t.turno,
        status: t.status,
        alunosMatriculados,
        alunosAtivos,
        alunosInativos,
        vagasTotais: t.vagas_totais
      };
    });
  },

  async createTurma(turma: Omit<Turma, 'id' | 'alunosMatriculados'>): Promise<Turma> {
    const dbData = {
      codigo: turma.codigo,
      nome: turma.nome,
      curso_id: turma.cursoId,
      polo_id: turma.poloId || '44444444-4444-4444-4444-444444444444', // default to Matriz if EAD or undefined
      data_inicio: turma.dataInicio || null,
      data_previsao_termino: turma.dataPrevisaoTermino || null,
      turno: turma.turno,
      status: turma.status || 'EM_ANDAMENTO',
      vagas_totais: Number(turma.vagasTotais) || 40
    };

    const { data, error } = await supabase
      .from('turmas')
      .insert(dbData)
      .select('*, cursos(*), polos(nome)')
      .single();

    if (error) {
      console.error('Erro ao criar turma:', error);
      throw error;
    }

    return {
      id: data.id,
      codigo: data.codigo,
      nome: data.nome,
      cursoId: data.curso_id,
      cursoNome: data.cursos?.nome || '',
      modalidade: data.cursos?.modalidade || 'TECNICO',
      poloId: data.polo_id,
      poloNome: data.polos?.nome || '',
      dataInicio: data.data_inicio,
      dataPrevisaoTermino: data.data_previsao_termino,
      turno: data.turno,
      status: data.status,
      alunosMatriculados: 0,
      alunosAtivos: 0,
      alunosInativos: 0,
      vagasTotais: data.vagas_totais
    };
  },

  async finalizarTurma(id: string): Promise<void> {
    const { error } = await supabase
      .from('turmas')
      .update({ status: 'FINALIZADA' })
      .eq('id', id);

    if (error) {
      console.error('Erro ao finalizar turma:', error);
      throw error;
    }
  },

  // Busca cursos do cadastro por modalidade
  async getCursosByModalidade(modalidade: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('*')
      .eq('modalidade', modalidade)
      .eq('status', 'ativo')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar cursos por modalidade:', error);
      throw error;
    }

    return data || [];
  }
};
