import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { birthdayAgentService } from './birthday.service';
import { BirthdayAgentSettings } from './birthday.types';

type ToastApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
};

export const useBirthdayAgent = (queryClient: QueryClient, toast: ToastApi) => {
  const settingsQuery = useQuery({
    queryKey: ['whatsapp', 'agentes', 'aniversario', 'config'],
    queryFn: birthdayAgentService.getSettings,
    staleTime: 30_000,
  });

  const projectionQuery = useQuery({
    queryKey: ['whatsapp', 'agentes', 'aniversario', 'projecao'],
    queryFn: () => birthdayAgentService.getProjection(),
    staleTime: 30_000,
  });

  const bankQuery = useQuery({
    queryKey: ['whatsapp', 'agentes', 'aniversario', 'banco'],
    queryFn: birthdayAgentService.getBankStats,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (settings: BirthdayAgentSettings) => birthdayAgentService.saveSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'agentes', 'aniversario'] });
      toast.success('Agente salvo', 'Configurações de aniversário atualizadas.');
    },
    onError: (err: any) => toast.error('Erro ao salvar', err?.message || 'Não foi possível salvar o agente.'),
  });

  return {
    settings: settingsQuery.data || null,
    projection: projectionQuery.data || [],
    bankStats: bankQuery.data || null,
    loading: settingsQuery.isLoading || projectionQuery.isLoading || bankQuery.isLoading,
    saving: saveMutation.isPending,
    save: (settings: BirthdayAgentSettings) => saveMutation.mutate(settings),
  };
};
