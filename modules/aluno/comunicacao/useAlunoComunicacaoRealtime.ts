import { Dispatch, SetStateAction, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../../../lib/supabase';
import {
  alunoComunicacaoKeys,
  alunoComunicacaoService,
} from './comunicacao.service';
import { ComunicacaoChat, ComunicacaoMensagem } from './comunicacao.types';

interface UseAlunoComunicacaoRealtimeParams {
  alunoId: string;
  activeChatId: string | null;
  supportPoloId?: string | null;
  setUnreadChatIds: Dispatch<SetStateAction<Set<string>>>;
}

export const useAlunoComunicacaoRealtime = ({
  alunoId,
  activeChatId,
  supportPoloId,
  setUnreadChatIds,
}: UseAlunoComunicacaoRealtimeParams) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supportPoloId) return;
    const channel = supabase
      .channel(`aluno_support_config_${supportPoloId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comunicacao_atendimento_config',
          filter: `polo_id=eq.${supportPoloId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.supportConfig(alunoId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient, supportPoloId]);

  useEffect(() => {
    const notifyReply = async (chatId: string) => {
      if (Capacitor.isNativePlatform()) return;
      if (!('Notification' in window) || window.Notification.permission !== 'granted' || !document.hidden) return;
      const chat = await alunoComunicacaoService.getChatById(chatId).catch(() => null);
      if (!chat || chat.remetente_id !== alunoId || !chat.notificar_resposta) return;

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        await registration?.showNotification('Nova resposta da Universo', {
          body: 'Seu atendimento recebeu uma nova mensagem.',
          icon: '/aluno/icons/app-icon-v3-192.png',
          badge: '/aluno/icons/app-icon-v3-192.png',
          tag: `universo-chat-${chatId}`,
          data: { url: `/aluno/comunicacao?chatId=${encodeURIComponent(chatId)}` },
        });
      }
    };

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
        { event: 'INSERT', schema: 'public', table: 'comunicacao_mensagens' },
        (payload) => {
          void fetchUnread();
          const message = payload.new as ComunicacaoMensagem;
          if (message.remetente_tipo === 'gestor' || message.remetente_tipo === 'sistema') {
            void notifyReply(message.chat_id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'comunicacao_mensagens' },
        () => void fetchUnread()
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
        async (payload) => {
          const [newMessage] = await alunoComunicacaoService.resolveMessages([
            payload.new as ComunicacaoMensagem,
          ]);

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
