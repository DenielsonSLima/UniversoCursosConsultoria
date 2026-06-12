
import { supabase } from '../../../lib/supabase';

export const dashboardService = {
  async getStats() {
    // Exemplo de chamada futura
    // const { count } = await supabase.from('alunos').select('*', { count: 'exact' });
    return {
        alunos: 0,
        turmas: 0
    };
  }
};
