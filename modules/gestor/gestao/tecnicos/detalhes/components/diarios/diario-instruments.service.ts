import { supabase } from '../../../../../../../lib/supabase';
import { ActiveInstruments } from './diario-classe.types';
import { normalizeActiveInstruments } from './diario-instruments';

export const diarioInstrumentsService = {
  async get(turmaId: string, disciplinaId: string): Promise<ActiveInstruments | null> {
    const { data, error } = await supabase
      .from('turmas_disciplinas')
      .select('instrumentos_avaliativos')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId)
      .maybeSingle();

    if (error) throw error;
    if (!data?.instrumentos_avaliativos) return null;
    return normalizeActiveInstruments(data.instrumentos_avaliativos);
  },

  async save(
    turmaId: string,
    disciplinaId: string,
    value: ActiveInstruments,
  ): Promise<ActiveInstruments> {
    const normalized = normalizeActiveInstruments(value);
    const { data, error } = await supabase.rpc(
      'set_diario_instrumentos_avaliativos',
      {
        p_turma_id: turmaId,
        p_disciplina_id: disciplinaId,
        p_instrumentos: normalized,
      },
    );

    if (error) throw error;
    return normalizeActiveInstruments(data);
  },
};
