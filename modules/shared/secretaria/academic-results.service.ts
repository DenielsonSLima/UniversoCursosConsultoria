import { supabase } from '../../../lib/supabase';

export interface SecretariaAcademicResult {
  id: string;
  disciplinaId: string;
  disciplinaNome: string;
  notaP: number | null;
  notaTi: number | null;
  notaTg: number | null;
  notaS: number | null;
  notaCq: number | null;
  notaO: number | null;
  notaRec: number | null;
  mediaFinal: number | null;
  frequenciaPercent: number | null;
  resultadoFinal: string;
}

interface DisciplineRow {
  disciplina_id: string;
  disciplinas?: { nome?: string | null } | Array<{ nome?: string | null }> | null;
}

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const disciplineName = (row: DisciplineRow) => {
  const relation = Array.isArray(row.disciplinas) ? row.disciplinas[0] : row.disciplinas;
  return relation?.nome || 'Disciplina';
};

const loadDisciplines = async (turmaId: string): Promise<DisciplineRow[]> => {
  const { data, error } = await supabase
    .from('turmas_disciplinas')
    .select('disciplina_id, disciplinas(nome)')
    .eq('turma_id', turmaId);
  if (error) throw error;
  return (data || []) as unknown as DisciplineRow[];
};

const mapResult = (
  row: any,
  namesById: Map<string, string>,
): SecretariaAcademicResult => ({
  id: `${row.turma_id}:${row.disciplina_id}:${row.aluno_id}`,
  disciplinaId: row.disciplina_id,
  disciplinaNome: namesById.get(row.disciplina_id) || 'Disciplina',
  notaP: nullableNumber(row.nota_p),
  notaTi: nullableNumber(row.nota_ti),
  notaTg: nullableNumber(row.nota_tg),
  notaS: nullableNumber(row.nota_s),
  notaCq: nullableNumber(row.nota_cq),
  notaO: nullableNumber(row.nota_o),
  notaRec: nullableNumber(row.nota_rec),
  mediaFinal: nullableNumber(row.media_final),
  frequenciaPercent: nullableNumber(row.frequencia_percent),
  resultadoFinal: String(row.resultado_final || 'SEM_LANCAMENTO').toUpperCase(),
});

export const secretariaAcademicResultsService = {
  async getForAuthenticatedStudent(turmaId: string): Promise<SecretariaAcademicResult[]> {
    const disciplines = await loadDisciplines(turmaId);
    if (!disciplines.length) return [];
    const namesById = new Map(disciplines.map((item) => [item.disciplina_id, disciplineName(item)]));
    const { data, error } = await supabase.rpc('get_aluno_diario_resultados', {
      p_turma_id: turmaId,
      p_disciplina_ids: disciplines.map((item) => item.disciplina_id),
    });
    if (error) throw error;
    return (data || []).map((row: any) => mapResult(row, namesById));
  },

  async getForManagedStudent(
    turmaId: string,
    alunoId: string,
  ): Promise<SecretariaAcademicResult[]> {
    const disciplines = await loadDisciplines(turmaId);
    const rows = await Promise.all(disciplines.map(async (discipline) => {
      const { data, error } = await supabase
        .rpc('get_diario_resultados', {
          p_turma_id: turmaId,
          p_disciplina_id: discipline.disciplina_id,
        })
        .eq('aluno_id', alunoId);
      if (error) throw error;
      return data || [];
    }));
    const namesById = new Map(disciplines.map((item) => [item.disciplina_id, disciplineName(item)]));
    return rows.flat().map((row: any) => mapResult(row, namesById));
  },
};
