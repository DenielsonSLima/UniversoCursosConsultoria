import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { publicUnitKeys } from './contact.keys';
import { contactService } from './contact.service';

const PUBLIC_UNITS_STALE_TIME = 5 * 60 * 1000;

export const usePublicUnits = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidatePublicUnits = () => {
      void queryClient.invalidateQueries({ queryKey: publicUnitKeys.all });
    };

    const channel = supabase
      .channel('public_units_source_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'polos',
        },
        invalidatePublicUnits,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'empresas',
        },
        invalidatePublicUnits,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comunicacao_atendimento_config',
        },
        invalidatePublicUnits,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: publicUnitKeys.list(),
    queryFn: contactService.listPublicUnits,
    staleTime: PUBLIC_UNITS_STALE_TIME,
    refetchInterval: PUBLIC_UNITS_STALE_TIME,
    refetchOnWindowFocus: true,
  });
};
