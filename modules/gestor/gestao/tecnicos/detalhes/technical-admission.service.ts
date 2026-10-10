import { supabase } from '../../../../../lib/supabase';
import { requireTechnicalAdmissionPolicy } from '../../../../shared/utils/technicalAdmissionPolicy';

export const technicalAdmissionService = {
  async getPolicy(turmaId: string) {
    const { data, error } = await supabase.rpc('get_turma_tecnica_ingresso_secure', { p_turma_id: turmaId });
    if (error) throw error;
    return requireTechnicalAdmissionPolicy(data, turmaId);
  },
};
