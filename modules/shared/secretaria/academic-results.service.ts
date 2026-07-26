import { supabase } from '../../../lib/supabase';
import type {
  SecretariaAcademicModule,
  SecretariaAcademicModuleStatus,
} from './academic-results.modules';
import { isAvailableAcademicModuleStatus } from './academic-results.modules';

export type {
  SecretariaAcademicModule,
  SecretariaAcademicModuleStatus,
} from './academic-results.modules';

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

interface AcademicPeriodRow {
  id: string;
  modulo_id: string | null;
  nome: string | null;
  ordem: number | null;
  status: SecretariaAcademicModuleStatus;
}

interface StartedDisciplineRow extends DisciplineRow {
  periodo_letivo?:
    | AcademicPeriodRow
    | AcademicPeriodRow[]
    | null;
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
  async getAvailableModulesForAuthenticatedStudent(
    turmaId: string,
  ): Promise<SecretariaAcademicModule[]> {
    const { data, error } = await supabase
      .from('turmas_disciplinas')
      .select(`
        disciplina_id,
        disciplinas(nome),
        periodo_letivo:periodos_letivos!turmas_disciplinas_periodo_letivo_id_fkey!inner(
          id, modulo_id, nome, ordem, status
        )
      `)
      .eq('turma_id', turmaId)
      .in('periodo_letivo.status', ['ABERTO', 'EM_FECHAMENTO', 'FECHADO']);
    if (error) throw error;

    const modulesByPeriod = new Map<string, SecretariaAcademicModule>();
    ((data || []) as unknown as StartedDisciplineRow[]).forEach((row) => {
      const period = Array.isArray(row.periodo_letivo)
        ? row.periodo_letivo[0]
        : row.periodo_letivo;
      if (
        !period?.id
        || !period.modulo_id
        || !isAvailableAcademicModuleStatus(period.status)
      ) return;

      const module = modulesByPeriod.get(period.id) || {
        periodId: period.id,
        moduleId: period.modulo_id,
        name: period.nome || 'Módulo',
        order: Number(period.ordem || 0),
        status: period.status,
        disciplines: [],
      };
      if (
        row.disciplina_id
        && !module.disciplines.some((discipline) => discipline.id === row.disciplina_id)
      ) {
        module.disciplines.push({
          id: row.disciplina_id,
          name: disciplineName(row),
        });
      }
      modulesByPeriod.set(period.id, module);
    });

    return [...modulesByPeriod.values()].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  },

  async getForAuthenticatedStudent(
    turmaId: string,
    module: SecretariaAcademicModule,
  ): Promise<SecretariaAcademicResult[]> {
    const disciplines = module.disciplines;
    if (!disciplines.length) return [];
    const namesById = new Map(disciplines.map((item) => [item.id, item.name]));
    const { data, error } = await supabase.rpc('get_aluno_diario_resultados', {
      p_turma_id: turmaId,
      p_disciplina_ids: disciplines.map((item) => item.id),
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
