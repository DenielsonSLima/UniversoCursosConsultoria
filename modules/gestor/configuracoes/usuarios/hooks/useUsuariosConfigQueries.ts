import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { polosService } from '../../polos/polos.service';
import { usuariosKeys } from '../usuarios.keys';
import { usuariosService } from '../usuarios.service';
import { UsuarioSistema } from '../usuarios.types';

export const useUsuariosPolosQuery = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('usuarios_config_polos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        () => {
          void queryClient.invalidateQueries({ queryKey: usuariosKeys.polos() });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: usuariosKeys.polos(),
    queryFn: polosService.getAll,
    staleTime: 60_000,
  });
};

export const useUsuariosCountsQuery = () =>
  useQuery<Record<string, number>>({
    queryKey: usuariosKeys.counts(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios_sistema')
        .select('context');

      if (error) throw new Error(error.message);

      return (data || []).reduce((acc: Record<string, number>, user: any) => {
        acc[user.context] = (acc[user.context] || 0) + 1;
        return acc;
      }, {});
    },
    staleTime: 30_000,
  });

export const useUsuariosByContextQuery = (contextId: string) =>
  useQuery<UsuarioSistema[]>({
    queryKey: usuariosKeys.byContext(contextId),
    queryFn: () => contextId === 'global'
      ? usuariosService.getGlobalUsers()
      : usuariosService.getUsersByContext(contextId),
    staleTime: 30_000,
  });

export const useUsuariosManagementStatesQuery = (
  contextId: string,
  users: UsuarioSistema[],
) =>
  useQuery({
    queryKey: usuariosKeys.management(contextId),
    queryFn: () => usuariosService.getManagementStates(
      users.flatMap(user => user.id ? [user.id] : []),
    ),
    enabled: users.length > 0,
    staleTime: 30_000,
  });
