import { supabase } from '../../../../../../lib/supabase';

export const PROFESSOR_ASSIGNMENTS_PAGE_SIZE = 12;
export type AssignmentStatus = 'todas' | 'andamento' | 'concluidas';

export interface ProfessorAssignment {
  turma_id: string;
  disciplina_id: string;
  concluida: boolean;
  disciplina: { nome: string; carga_horaria: number | null } | null;
  periodo: { nome: string; status: string } | null;
  turma: {
    nome: string; codigo: string; status: string; turno: string | null;
    data_inicio: string | null; data_previsao_termino: string | null;
    curso: { nome: string; modalidade: string } | null;
    polo: { nome: string; cidade: string | null; estado: string | null } | null;
  };
}

interface AssignmentInput {
  professorId: string;
  poloId?: string | null;
  status: AssignmentStatus;
  page: number;
  turmaSearch: string;
}

export async function loadProfessorAssignments(input: AssignmentInput, client = supabase) {
  if (!input.professorId) throw new Error('Professor não informado.');
  const page = Math.max(0, Math.floor(input.page));
  let query = client.from('turmas_disciplinas').select(`
    turma_id, disciplina_id, concluida,
    disciplina:disciplinas(nome, carga_horaria),
    periodo:periodos_letivos(nome, status),
    turma:turmas!inner(nome, codigo, status, turno, data_inicio, data_previsao_termino,
      curso:cursos(nome, modalidade), polo:polos(nome, cidade, estado))
  `, { count: 'exact' }).eq('professor_id', input.professorId);
  if (input.poloId) query = query.eq('turma.polo_id', input.poloId);
  if (input.status !== 'todas') query = query.eq('concluida', input.status === 'concluidas');
  const search = input.turmaSearch.trim().replace(/[\\%_]/g, '\\$&');
  if (search) query = query.ilike('turma.nome', `%${search}%`);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('turma_id').order('disciplina_id')
    .range(page * PROFESSOR_ASSIGNMENTS_PAGE_SIZE, (page + 1) * PROFESSOR_ASSIGNMENTS_PAGE_SIZE - 1);
  if (error) throw error;
  if (count === null) throw new Error('Não foi possível confirmar a quantidade de vínculos.');
  return { items: (data || []) as unknown as ProfessorAssignment[], count };
}
