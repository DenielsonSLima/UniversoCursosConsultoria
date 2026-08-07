import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
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
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const instanceIdRef = useRef(
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  );
  const lastResyncAtRef = useRef(0);
  const instanceId = instanceIdRef.current;

  useEffect(() => {
    let disposed = false;
    let nativeHandle: PluginListenerHandle | undefined;
    const resync = () => {
      const now = Date.now();
      if (now - lastResyncAtRef.current < 750) return;
      lastResyncAtRef.current = now;
      void queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.chats(alunoId) });
      void queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      void queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.supportConfig(alunoId) });
      setReconnectVersion((current) => current + 1);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resync();
    };

    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', handleVisibility);
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) resync();
      }).then((handle) => {
        if (disposed) void handle.remove();
        else nativeHandle = handle;
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener('online', resync);
      document.removeEventListener('visibilitychange', handleVisibility);
      void nativeHandle?.remove();
    };
  }, [alunoId, queryClient]);

  useEffect(() => {
    if (!supportPoloId) return;
    const channel = supabase
      .channel(`aluno_support_config_${supportPoloId}_${instanceId}_${reconnectVersion}`)
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.supportConfig(alunoId) });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alunoId, instanceId, queryClient, reconnectVersion, supportPoloId]);

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
      .channel(`aluno_comunicacao_msgs_global_${alunoId}_${instanceId}_${reconnectVersion}`)
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void fetchUnread();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alunoId, instanceId, reconnectVersion, setUnreadChatIds]);

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
      .channel(`aluno_msgs_${activeChatId}_${instanceId}_${reconnectVersion}`)
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.messages(activeChatId) });
          void markAsRead();
        }
      });

    markAsRead();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeChatId, instanceId, queryClient, reconnectVersion]);

  useEffect(() => {
    const channel = supabase
      .channel(`aluno_chats_${alunoId}_${instanceId}_${reconnectVersion}`)
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.chats(alunoId) });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alunoId, instanceId, queryClient, reconnectVersion]);
};
