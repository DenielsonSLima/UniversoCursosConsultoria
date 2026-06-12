
import { supabase } from '../../../../lib/supabase';

export const apiStatusService = {
  async checkHealth() {
    // const { error } = await supabase.from('health_check').select('status').single();
    return true;
  }
};
