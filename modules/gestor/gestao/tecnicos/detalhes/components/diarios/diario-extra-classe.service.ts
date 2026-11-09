import { supabase } from '../../../../../../../lib/supabase';
import { assertExtraClassCredit } from './diario-pdf.contract.validation-extra-class';

export const getDiarioExtraClasseCredito = async (
  turmaId: string,
  disciplinaId: string,
  signal?: AbortSignal,
) => {
  const request = supabase.rpc('get_diario_extra_classe_credito', {
    p_turma_id: turmaId,
    p_disciplina_id: disciplinaId,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return assertExtraClassCredit(data).credit;
};
