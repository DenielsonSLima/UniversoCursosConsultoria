import { Dispatch, SetStateAction, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  alunoComunicacaoKeys,
  alunoComunicacaoService,
} from './comunicacao.service';
import { ComunicacaoChat, ComunicacaoMensagem } from './comunicacao.types';

interface UseAlunoComunicacaoRealtimeParams {
  alunoId: string;
  activeChatId: string | null;
  setUnreadChatIds: Dispatch<SetStateAction<Set<string>>>;
}

export const useAlunoComunicacaoRealtime = ({
  alunoId,
  activeChatId,
  setUnreadChatIds,
}: UseAlunoComunicacaoRealtimeParams) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        setUnreadChatIds(await alunoComunicacaoService.getUnreadChatIds(alunoId));
      } catch (err) {
        console.error('Erro ao buscar chamados não lidos:', err);
      }
    };

    fetchUnread();

    const channel = supabase
      .channel('aluno_comunicacao_msgs_global_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comunicacao_mensagens' },
        fetchUnread
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, setUnreadChatIds]);

  useEffect(() => {
    if (!activeChatId) return;

    const markAsRead = async () => {
      try {
        await alunoComunicacaoService.markMessagesAsRead(activeChatId);
      } catch (err) {
        console.error('Erro ao marcar mensagens como lidas:', err);
      }
    };

    const channel = supabase
      .channel(`aluno_msgs_realtime_${activeChatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comunicacao_mensagens',
          filter: `chat_id=eq.${activeChatId}`,
        },
        (payload) => {
          const newMessage = payload.new as ComunicacaoMensagem;

          queryClient.setQueryData(
            alunoComunicacaoKeys.messages(activeChatId),
            (oldData: ComunicacaoMensagem[] | undefined) => {
              if (!oldData) return [newMessage];
              if (oldData.some(message => message.id === newMessage.id)) return oldData;
              return [...oldData, newMessage];
            }
          );

          if (newMessage.remetente_tipo === 'gestor' || newMessage.remetente_tipo === 'sistema') {
            markAsRead();
          }
        }
      )
      .subscribe();

    markAsRead();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChatId, queryClient]);

  useEffect(() => {
    const channel = supabase
      .channel(`aluno_chats_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comunicacao_chats',
          filter: `remetente_id=eq.${alunoId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.chats(alunoId) });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comunicacao_chats',
          filter: `remetente_id=eq.${alunoId}`,
        },
        async (payload) => {
          const changedId = (payload.new as { id: string }).id;
          const freshChat = await alunoComunicacaoService.getChatById(changedId);
          if (!freshChat) return;

          queryClient.setQueryData(
            alunoComunicacaoKeys.chats(alunoId),
            (oldData: ComunicacaoChat[] | undefined) => {
              if (!oldData) return [freshChat];
              const updated = oldData.map(chat => chat.id === freshChat.id ? freshChat : chat);
              return [...updated].sort(
                (a, b) => new Date(b.ultima_data || 0).getTime() - new Date(a.ultima_data || 0).getTime()
              );
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);
};
