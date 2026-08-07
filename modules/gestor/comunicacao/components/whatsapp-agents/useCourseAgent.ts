import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { courseAgentService } from './course-agent.service';
import { CourseAgentFaq, CourseAgentSettings } from './course-agent.types';

type ToastApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
};

export const useCourseAgent = (
  connectionId: string | null,
  queryClient: QueryClient,
  toast: ToastApi,
) => {
  const rootKey = ['whatsapp', connectionId, 'agentes', 'cursos'];
  const enabled = Boolean(connectionId);
  const settingsQuery = useQuery({
    queryKey: [...rootKey, 'config'],
    queryFn: () => courseAgentService.getSettings(connectionId!),
    enabled,
    staleTime: 30_000,
  });
  const faqQuery = useQuery({
    queryKey: [...rootKey, 'faq'],
    queryFn: () => courseAgentService.getFaqs(connectionId!),
    enabled,
    staleTime: 30_000,
  });
  const statsQuery = useQuery({
    queryKey: [...rootKey, 'stats'],
    queryFn: () => courseAgentService.getStats(connectionId!),
    enabled,
    staleTime: 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'agentes', 'cursos'] });

  const saveSettingsMutation = useMutation({
    mutationFn: courseAgentService.saveSettings,
    onSuccess: () => {
      invalidate();
      toast.success('Agente salvo', 'Configurações do agente de cursos atualizadas.');
    },
    onError: (error: any) =>
      toast.error('Erro ao salvar', error?.message || 'Não foi possível salvar o agente.'),
  });
  const saveFaqMutation = useMutation({
    mutationFn: courseAgentService.saveFaq,
    onSuccess: () => {
      invalidate();
      toast.success('Resposta salva', 'A base de conhecimento foi atualizada.');
    },
    onError: (error: any) =>
      toast.error('Erro ao salvar resposta', error?.message || 'Revise os campos e tente novamente.'),
  });
  const deleteFaqMutation = useMutation({
    mutationFn: courseAgentService.deleteFaq,
    onSuccess: () => {
      invalidate();
      toast.success('Resposta removida');
    },
    onError: (error: any) =>
      toast.error('Erro ao remover', error?.message || 'Não foi possível remover a resposta.'),
  });

  return {
    settings: settingsQuery.data || null,
    faqs: faqQuery.data || [],
    stats: statsQuery.data || null,
    loading: settingsQuery.isLoading || faqQuery.isLoading || statsQuery.isLoading,
    savingSettings: saveSettingsMutation.isPending,
    savingFaq: saveFaqMutation.isPending,
    deletingFaq: deleteFaqMutation.isPending,
    saveSettings: (settings: CourseAgentSettings) => saveSettingsMutation.mutate(settings),
    saveFaq: (faq: CourseAgentFaq) => saveFaqMutation.mutateAsync(faq),
    deleteFaq: (id: string) => deleteFaqMutation.mutate(id),
  };
};
