import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import type { getGestorAccessScope } from '../../login/portal-session';

export interface GestorPoloOption {
  id: string;
  nome: string;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  is_matriz: boolean;
  status: string;
}

interface UseGestorPolosOptions {
  profileId?: string;
  gestorScope: ReturnType<typeof getGestorAccessScope>;
  canUsePortal: boolean;
}

export const useGestorPolos = ({ profileId, gestorScope, canUsePortal }: UseGestorPolosOptions) => {
  const queryClient = useQueryClient();
  const allowedPoloIdsKey = useMemo(
    () => gestorScope.isGlobal
      ? 'global'
      : [...(gestorScope.allowedPoloIds || [])].sort().join(','),
    [gestorScope.allowedPoloIds, gestorScope.isGlobal],
  );
  const { data: activePolos = [], isLoading: isLoadingPolos } = useQuery<GestorPoloOption[]>({
    queryKey: ['active_polos', profileId || 'sem-usuario', allowedPoloIdsKey],
    queryFn: async () => {
      let query = supabase
        .from('polos')
        .select('id, nome, cnpj, cidade, estado, is_matriz, status')
        .eq('status', 'ativo')
        .order('is_matriz', { ascending: false })
        .order('nome', { ascending: true });

      if (!gestorScope.isGlobal) {
        query = query.in('id', gestorScope.allowedPoloIds || []);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: canUsePortal && (gestorScope.isGlobal || Boolean(gestorScope.allowedPoloIds?.length)),
  });

  useEffect(() => {
    if (!canUsePortal) return;

    let channel = supabase.channel(`header_polos_realtime_${profileId || 'usuario'}`);
    const invalidatePolos = () => {
      void queryClient.invalidateQueries({ queryKey: ['active_polos'] });
    };

    if (gestorScope.isGlobal) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        invalidatePolos,
      )
    } else {
      (gestorScope.allowedPoloIds || []).forEach((poloId) => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'polos', filter: `id=eq.${poloId}` },
          invalidatePolos,
        );
      });
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    canUsePortal,
    gestorScope.allowedPoloIds,
    gestorScope.isGlobal,
    profileId,
    queryClient,
  ]);

  return { activePolos, isLoadingPolos };
};
