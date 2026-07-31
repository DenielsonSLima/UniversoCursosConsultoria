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

interface CanonicalAcademicComponent {
  disciplineId?: string | null;
  discipline?: string | null;
  nota?: number | null;
  frequencia?: number | null;
  situacao?: string | null;
  dependencyAttemptId?: string | null;
}

interface CanonicalAcademicDocument {
  componentes?: CanonicalAcademicComponent[];
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

const canonicalResultStatus = (
  component: CanonicalAcademicComponent,
): string => {
  if (component.dependencyAttemptId) return 'APROVADO_DEPENDENCIA';
  const status = String(component.situacao || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase()
    .replaceAll(' ', '_');
  const map: Record<string, string> = {
    APROVADO: 'APROVADO',
    APROVEITADO: 'APROVEITADO',
    REPROVADO: 'REPROVADO',
    REPROVADO_POR_FREQUENCIA: 'REPROVADO_FREQUENCIA',
    RECUPERACAO: 'EM_RECUPERACAO',
    FREQUENCIA_PENDENTE: 'FREQUENCIA_PENDENTE',
    SEM_LANCAMENTO: 'SEM_LANCAMENTO',
  };
  return map[status] || status || 'SEM_LANCAMENTO';
};

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

  async getForManagedEnrollment(
    matriculaId: string,
  ): Promise<SecretariaAcademicResult[]> {
    const { data, error } = await supabase.rpc(
      'get_secretaria_documento_academico',
      {
        p_matricula_id: matriculaId,
        p_documento: 'boletim',
      },
    );
    if (error) throw error;
    const payload = (data || {}) as CanonicalAcademicDocument;
    return (payload.componentes || []).map((component, index) => ({
      id: `${matriculaId}:${component.disciplineId || index}`,
      disciplinaId: String(component.disciplineId || ''),
      disciplinaNome: component.discipline || 'Disciplina',
      notaP: null,
      notaTi: null,
      notaTg: null,
      notaS: null,
      notaCq: null,
      notaO: null,
      notaRec: null,
      mediaFinal: nullableNumber(component.nota),
      frequenciaPercent: nullableNumber(component.frequencia),
      resultadoFinal: canonicalResultStatus(component),
    }));
  },
};
