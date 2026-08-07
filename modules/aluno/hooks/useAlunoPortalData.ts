import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { alunoCourseAccessKeys } from '../shared/aluno-course-access.queries';

const unreadChatsKey = (alunoId: string) =>
  ['aluno', alunoId, 'comunicacao', 'chamados-nao-lidos'] as const;

export const useAlunoCalendarEligibility = (alunoId: string, enabled: boolean) => {
  const { data = false } = useQuery({
    queryKey: alunoCourseAccessKeys.calendarEligibility(alunoId),
    enabled: enabled && Boolean(alunoId),
    queryFn: async () => {
      const { data: enrollments, error } = await supabase
        .from('matriculas')
        .select(`
          id,
          turmas!inner(
            id,
            cursos!inner(id, modalidade)
          )
        `)
        .eq('aluno_id', alunoId)
        .in('status', ['ATIVO', 'CONCLUIDO', 'EM_DEPENDENCIA'])
        .in('turmas.cursos.modalidade', ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'])
        .limit(1);

      if (error) throw error;
      return (enrollments?.length || 0) > 0;
    },
  });

  return data;
};

export const useAlunoUnreadChats = (alunoId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  const queryKey = unreadChatsKey(alunoId);
  const canFetch = enabled && Boolean(alunoId);

  const { data = 0 } = useQuery({
    queryKey,
    enabled: canFetch,
    queryFn: async () => {
      const { data: studentChats, error: chatsError } = await supabase
        .from('comunicacao_chats')
        .select('id')
        .eq('remetente_id', alunoId)
        .eq('deleted_by_aluno', false);

      if (chatsError) throw chatsError;

      const chatIds = studentChats?.map((chat) => chat.id) || [];
      if (chatIds.length === 0) return 0;

      const { data: unreadMessages, error: messagesError } = await supabase
        .from('comunicacao_mensagens')
        .select('chat_id')
        .in('chat_id', chatIds)
        .eq('lida', false)
        .in('remetente_tipo', ['gestor', 'sistema']);

      if (messagesError) throw messagesError;
      return new Set(unreadMessages?.map((message) => message.chat_id) || []).size;
    },
  });

  useEffect(() => {
    if (!canFetch) return;

    const badgeChannel = supabase
      .channel(`aluno_sidebar_unread_badge_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comunicacao_mensagens' },
        () => {
          void queryClient.invalidateQueries({ queryKey, exact: true });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(badgeChannel);
    };
  }, [alunoId, canFetch, queryClient]);

  return data;
};
