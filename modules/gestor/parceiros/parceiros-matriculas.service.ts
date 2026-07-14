import { supabase } from '../../../lib/supabase';
import { formatPoloNome } from './utils/parceiro-mappers';

const statusMovement: Record<string, string> = {
  ATIVO: 'REATIVACAO',
  TRANCADO: 'TRANCAMENTO',
  CANCELADO: 'CANCELAMENTO',
  DESISTENTE: 'DESISTENCIA',
  CONCLUIDO: 'CONCLUSAO',
};

export const parceirosMatriculasService = {
  async getMatriculas(alunoId: string) {
    const { data, error } = await supabase
      .from('matriculas')
      .select('*, turmas(*, cursos(*))')
      .eq('aluno_id', alunoId);
    if (error) throw error;
    return data || [];
  },

  async matricularAluno(alunoId: string, turmaId: string) {
    const { data, error } = await supabase.rpc('matricular_aluno_turma', {
      p_aluno_id: alunoId,
      p_turma_id: turmaId,
      p_responsavel_id: null,
    });
    if (error) throw error;
    return data;
  },

  async updateMatriculaStatus(matriculaId: string, status: string) {
    const normalizedStatus = status.toUpperCase();
    const movementType = statusMovement[normalizedStatus];
    if (!movementType) throw new Error('Situação de matrícula exige uma ação acadêmica específica.');
    const { data, error } = await supabase.rpc('movimentar_matricula_academica', {
      p_matricula_id: matriculaId,
      p_tipo: movementType,
      p_motivo: 'Atualização de situação pelo cadastro do aluno.',
      p_observacao: null,
      p_data_movimentacao: null,
      p_data_retorno_prevista: null,
      p_responsavel_id: null,
    });
    if (error) throw error;
    return data;
  },

  async getTurmasDisponiveis(poloId?: string) {
    let query = supabase
      .from('turmas')
      .select('*, cursos(*), polos(nome,cidade,estado)')
      .eq('status', 'EM_ANDAMENTO');
    if (poloId && poloId !== 'todos') query = query.eq('polo_id', poloId);
    const { data, error } = await query.order('nome', { ascending: true });
    if (error) throw error;
    return (data || []).map((turma) => ({
      id: turma.id,
      codigo: turma.codigo,
      nome: turma.nome,
      cursoNome: turma.cursos?.nome,
      modalidade: turma.cursos?.modalidade,
      poloId: turma.polo_id,
      poloNome: formatPoloNome(turma.polos, turma.polo_id),
      turno: turma.turno,
      vagasTotais: turma.vagas_totais,
    }));
  },
};
