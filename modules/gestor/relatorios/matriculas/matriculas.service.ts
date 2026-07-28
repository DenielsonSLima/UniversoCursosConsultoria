import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';
import {
  MatriculasReportFilters,
  MatriculasReportPage,
  MatriculasTurmaOption,
} from './matriculas.types';
import {
  getMaceioDateBounds,
  getPageRange,
  normalizeEnrollmentStatus,
} from './matriculas.utils';

export const matriculasReportService = {
  async list(
    filters: MatriculasReportFilters,
    signal?: AbortSignal,
  ): Promise<MatriculasReportPage> {
    const range = getPageRange(filters.page, filters.pageSize);
    const dates = getMaceioDateBounds(filters.dataInicio, filters.dataFim);

    let query = supabase
      .from('matriculas')
      .select(`
        id, aluno_id, turma_id, status, data_matricula,
        parceiros!inner(nome, cpf_cnpj, polo_id),
        turmas!inner(
          id, nome, codigo, polo_id,
          cursos!inner(nome, modalidade),
          polos(nome, cidade)
        )
      `, { count: 'exact' })
      .order('data_matricula', { ascending: false })
      .order('id', { ascending: false })
      .range(range.from, range.to);

    if (signal) query = query.abortSignal(signal);
    if (filters.poloId) query = query.eq('turmas.polo_id', filters.poloId);
    if (filters.modalidade !== 'todos') {
      query = query.eq('turmas.cursos.modalidade', filters.modalidade);
    }
    if (filters.turmaId !== 'todos') query = query.eq('turma_id', filters.turmaId);
    if (filters.status !== 'todos') query = query.eq('status', filters.status);
    if (dates.from) query = query.gte('data_matricula', dates.from);
    if (dates.toExclusive) query = query.lt('data_matricula', dates.toExclusive);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      rows: (data || []).map((row: any) => {
        const aluno = row.parceiros || {};
        const turma = row.turmas || {};
        const curso = turma.cursos || {};
        const polo = turma.polos || {};
        return {
          id: row.id,
          alunoId: row.aluno_id,
          alunoNome: aluno.nome || 'Aluno não informado',
          alunoCpf: aluno.cpf_cnpj || '',
          matricula: formatMatricula(row.id, row.data_matricula, turma.polo_id || aluno.polo_id),
          dataMatricula: row.data_matricula,
          status: normalizeEnrollmentStatus(row.status),
          cursoNome: curso.nome || 'Curso não informado',
          modalidade: curso.modalidade || 'OUTRO',
          turmaId: turma.id,
          turmaNome: turma.nome || turma.codigo || 'Turma',
          turmaCodigo: turma.codigo || '',
          poloNome: polo.nome || polo.cidade || 'Matriz',
        };
      }),
      total: count || 0,
      page: range.page,
      pageSize: range.pageSize,
    };
  },

  async listTurmas(
    poloId?: string | null,
    modalidade = 'todos',
    signal?: AbortSignal,
  ): Promise<MatriculasTurmaOption[]> {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, polo_id, cursos!inner(modalidade)')
      .order('nome', { ascending: true });

    if (signal) query = query.abortSignal(signal);
    if (poloId) query = query.eq('polo_id', poloId);
    if (modalidade !== 'todos') query = query.eq('cursos.modalidade', modalidade);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      nome: row.nome || row.codigo || 'Turma',
      codigo: row.codigo || '',
    }));
  },
};
