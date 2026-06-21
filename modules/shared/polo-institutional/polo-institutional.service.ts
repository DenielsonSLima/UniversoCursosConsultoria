import { supabase } from '../../../lib/supabase';
import { PoloInstitutionalData } from './polo-institutional.types';

export const poloInstitutionalService = {
  async getByPoloId(poloId: string): Promise<PoloInstitutionalData | null> {
    const { data, error } = await supabase.rpc('get_dados_institucionais_polo', {
      p_polo_id: poloId,
    });

    if (error) throw error;
    return data as PoloInstitutionalData | null;
  },
};
