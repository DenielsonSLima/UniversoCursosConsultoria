import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { atendimentoConfigKeys, atendimentoConfigService } from './atendimento-config.service';

export const useAtendimentoConfig = (poloId: string | null) => {
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: atendimentoConfigKeys.workspace(poloId),
    queryFn: () => atendimentoConfigService.getWorkspace(poloId),
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: atendimentoConfigKeys.all });
  const saveConfig = useMutation({ mutationFn: atendimentoConfigService.saveConfig, onSuccess: invalidate });
  const addResponsavel = useMutation({ mutationFn: atendimentoConfigService.addResponsavel, onSuccess: invalidate });
  const removeResponsavel = useMutation({ mutationFn: atendimentoConfigService.removeResponsavel, onSuccess: invalidate });

  useEffect(() => {
    const channel = supabase.channel(`atendimento_config_${poloId || 'todos'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comunicacao_atendimento_config' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comunicacao_atendentes_polos' }, invalidate)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [poloId, queryClient]);

  return { workspace, saveConfig, addResponsavel, removeResponsavel };
};

