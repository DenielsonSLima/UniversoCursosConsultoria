import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { WhatsAppFlowSettings } from '../whatsapp/whatsapp.types';

type ToastApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
};

export const useWhatsAppFlow = (queryClient: QueryClient, toast: ToastApi) => {
  const settingsQuery = useQuery({
    queryKey: ['whatsapp', 'fluxos', 'config'],
    queryFn: whatsappService.getFlowSettings,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const sessionsQuery = useQuery({
    queryKey: ['whatsapp', 'fluxos', 'sessions'],
    queryFn: whatsappService.getFlowSessions,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const saveMutation = useMutation({
    mutationFn: (settings: WhatsAppFlowSettings) => whatsappService.saveFlowSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'fluxos'] });
      toast.success('Fluxo salvo', 'Atendimento automático atualizado.');
    },
    onError: (err: any) => toast.error('Erro ao salvar fluxo', err?.message || 'Não foi possível salvar o fluxo.'),
  });

  const pauseMutation = useMutation({
    mutationFn: whatsappService.pauseFlowForConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'fluxos'] });
      toast.success('Robô pausado', 'A conversa foi enviada para atendimento humano.');
    },
    onError: (err: any) => toast.error('Erro ao pausar', err?.message || 'Não foi possível pausar o robô.'),
  });

  const resetMutation = useMutation({
    mutationFn: whatsappService.resetFlowForConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'fluxos'] });
      toast.success('Robô retomado', 'Na próxima mensagem do aluno o fluxo será reiniciado.');
    },
    onError: (err: any) => toast.error('Erro ao retomar', err?.message || 'Não foi possível reiniciar o fluxo.'),
  });

  return {
    settings: settingsQuery.data || null,
    sessions: sessionsQuery.data || [],
    loading: settingsQuery.isLoading || sessionsQuery.isLoading,
    saving: saveMutation.isPending,
    save: (settings: WhatsAppFlowSettings) => saveMutation.mutate(settings),
    pause: (conversationId: string) => pauseMutation.mutate(conversationId),
    reset: (conversationId: string) => resetMutation.mutate(conversationId),
  };
};
