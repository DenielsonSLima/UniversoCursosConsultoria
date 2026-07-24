import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { WhatsAppFlowSettings } from '../whatsapp/whatsapp.types';

type ToastApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
};

export const useWhatsAppFlow = (
  connectionId: string | null,
  queryClient: QueryClient,
  toast: ToastApi,
) => {
  const settingsQuery = useQuery({
    queryKey: ['whatsapp', connectionId, 'fluxos', 'config'],
    queryFn: () => whatsappService.getFlowSettings(connectionId!),
    enabled: Boolean(connectionId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const sessionsQuery = useQuery({
    queryKey: ['whatsapp', connectionId, 'fluxos', 'sessions'],
    queryFn: () => whatsappService.getFlowSessions(connectionId!),
    enabled: Boolean(connectionId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const saveMutation = useMutation({
    mutationFn: (settings: WhatsAppFlowSettings) => {
      if (!connectionId) throw new Error('Selecione uma linha.');
      return whatsappService.saveFlowSettings(connectionId, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'fluxos'] });
      toast.success('Fluxo salvo', 'Atendimento automático atualizado.');
    },
    onError: (err: any) => toast.error('Erro ao salvar fluxo', err?.message || 'Não foi possível salvar o fluxo.'),
  });

  const pauseMutation = useMutation({
    mutationFn: whatsappService.pauseFlowForConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'fluxos'] });
      toast.success('Robô pausado', 'A conversa foi enviada para atendimento humano.');
    },
    onError: (err: any) => toast.error('Erro ao pausar', err?.message || 'Não foi possível pausar o robô.'),
  });

  const resetMutation = useMutation({
    mutationFn: whatsappService.resetFlowForConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'fluxos'] });
      toast.success('Robô retomado', 'Na próxima mensagem do aluno o fluxo será reiniciado.');
    },
    onError: (err: any) => toast.error('Erro ao retomar', err?.message || 'Não foi possível reiniciar o fluxo.'),
  });

  const closeMutation = useMutation({
    mutationFn: whatsappService.closeConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.success('Atendimento encerrado', 'A conversa foi movida para Finalizadas.');
    },
    onError: (err: any) => toast.error('Erro ao encerrar', err?.message || 'Não foi possível encerrar o atendimento.'),
  });

  const reopenMutation = useMutation({
    mutationFn: whatsappService.reopenConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.success('Atendimento reaberto', 'A conversa voltou para Abertas.');
    },
    onError: (err: any) => toast.error('Erro ao reabrir', err?.message || 'Não foi possível reabrir o atendimento.'),
  });

  return {
    settings: settingsQuery.data || null,
    sessions: sessionsQuery.data || [],
    loading: settingsQuery.isLoading || sessionsQuery.isLoading,
    saving: saveMutation.isPending,
    save: (settings: WhatsAppFlowSettings) => saveMutation.mutate(settings),
    pause: (conversationId: string) => pauseMutation.mutate(conversationId),
    reset: (conversationId: string) => resetMutation.mutate(conversationId),
    close: (conversationId: string) => closeMutation.mutate(conversationId),
    reopen: (conversationId: string) => reopenMutation.mutate(conversationId),
  };
};
