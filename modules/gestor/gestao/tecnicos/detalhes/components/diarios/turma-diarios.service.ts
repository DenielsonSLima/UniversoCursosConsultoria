import { supabase } from '../../../../../../../lib/supabase';
import {
  TurmaDiarioDisciplina,
  TurmaDiarioModulo,
  TurmaDiarioRpcRow,
} from './turma-diarios.types';

const toDisciplina = (
  row: TurmaDiarioRpcRow,
  bloqueioDiario: 'ABERTO' | 'PROFESSOR' | 'TOTAL',
): TurmaDiarioDisciplina => ({
  id: row.disciplina_id,
  nome: row.disciplina_nome,
  professor: row.professor_nome,
  horasRealizadas: Number(row.horas_realizadas),
  cargaHoraria: Number(row.carga_horaria),
  progressoPercent: Number(row.progresso_percent),
  horasStatus: row.horas_status,
  periodoStatus: row.periodo_status,
  concluida: row.concluida,
  primeiraAula: row.primeira_aula,
  ultimaAula: row.ultima_aula,
  presencaGeralPercent: row.presenca_geral_percent === null
    ? null
    : Number(row.presenca_geral_percent),
  bloqueioDiario,
});

const groupByModulo = (
  rows: TurmaDiarioRpcRow[],
  locks: Map<string, 'ABERTO' | 'PROFESSOR' | 'TOTAL'>,
): TurmaDiarioModulo[] => {
  const modules = new Map<string, TurmaDiarioModulo>();

  rows.forEach((row) => {
    const module = modules.get(row.modulo_id) ?? {
      id: row.modulo_id,
      nome: row.modulo_nome,
      disciplinas: [],
    };
    module.disciplinas.push(toDisciplina(row, locks.get(row.disciplina_id) || 'ABERTO'));
    modules.set(row.modulo_id, module);
  });

  return Array.from(modules.values());
};

export const turmaDiariosService = {
  async getByTurma(turmaId: string): Promise<TurmaDiarioModulo[]> {
    const [diariosResult, locksResult] = await Promise.all([
      supabase.rpc('get_diarios_turma', { p_turma_id: turmaId }),
      supabase
        .from('turmas_disciplinas')
        .select('disciplina_id, bloqueio_diario')
        .eq('turma_id', turmaId),
    ]);
    if (diariosResult.error) throw diariosResult.error;
    if (locksResult.error) throw locksResult.error;
    const locks = new Map<string, 'ABERTO' | 'PROFESSOR' | 'TOTAL'>(
      (locksResult.data || []).map((row: any) => [
        row.disciplina_id,
        row.bloqueio_diario || 'ABERTO',
      ]),
    );
    return groupByModulo((diariosResult.data || []) as TurmaDiarioRpcRow[], locks);
  },
};
