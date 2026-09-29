import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

export interface OrgaoEmissorIdentidade {
  sigla: string;
  nome: string;
}

export const useOrgaosEmissores = () => useQuery({
  queryKey: ['parceiros', 'orgaos-emissores-identidade'],
  queryFn: async ({ signal }): Promise<OrgaoEmissorIdentidade[]> => {
    const { data, error } = await supabase
      .from('orgaos_emissores_identidade')
      .select('sigla,nome')
      .eq('ativo', true)
      .order('sigla')
      .abortSignal(signal);
    if (error) throw error;
    return data || [];
  },
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  retry: 1,
});
