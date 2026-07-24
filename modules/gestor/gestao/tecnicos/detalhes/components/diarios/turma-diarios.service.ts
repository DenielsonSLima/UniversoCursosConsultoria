import { supabase } from '../../../../../../../lib/supabase';
import {
  TurmaDiarioDisciplina,
  TurmaDiarioModulo,
  TurmaDiarioRpcRow,
} from './turma-diarios.types';

const toDisciplina = (row: TurmaDiarioRpcRow): TurmaDiarioDisciplina => ({
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
});

const groupByModulo = (rows: TurmaDiarioRpcRow[]): TurmaDiarioModulo[] => {
  const modules = new Map<string, TurmaDiarioModulo>();

  rows.forEach((row) => {
    const module = modules.get(row.modulo_id) ?? {
      id: row.modulo_id,
      nome: row.modulo_nome,
      disciplinas: [],
    };
    module.disciplinas.push(toDisciplina(row));
    modules.set(row.modulo_id, module);
  });

  return Array.from(modules.values());
};

export const turmaDiariosService = {
  async getByTurma(turmaId: string): Promise<TurmaDiarioModulo[]> {
    const { data, error } = await supabase.rpc('get_diarios_turma', {
      p_turma_id: turmaId,
    });
    if (error) throw error;
    return groupByModulo((data || []) as TurmaDiarioRpcRow[]);
  },
};
