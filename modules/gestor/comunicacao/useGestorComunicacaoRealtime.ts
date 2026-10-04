import { useEffect, useLayoutEffect, useRef, useState, type SetStateAction } from 'react';
import { supabase } from '../../../lib/supabase';
import { resolveCommunicationAttachmentUrls } from '../../shared/comunicacao/comunicacao-attachments.service';
import {
  GestorCategory,
  GestorChat,
  GestorMessage,
  playGestorMessageSound,
} from './gestor-comunicacao.types';
import {
  getUnifiedSupportSelection,
  isUnifiedSupportActive,
  subscribeUnifiedSupportSelection,
  notifyUnifiedSupportOpened,
} from './unified-support-selection';

export const useGestorComunicacaoRealtime = () => {
  const [chats, setChats] = useState<GestorChat[]>([]);
  const [messages, setMessages] = useState<GestorMessage[]>([]);
  const [categories, setCategories] = useState<GestorCategory[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(new Set());
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentChatIdRef = useRef(activeChatId);
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useLayoutEffect(() => { currentChatIdRef.current = activeChatId; }, [activeChatId]);

  const setMessagesForActiveChat = (next: SetStateAction<GestorMessage[]>) => {
    if (!activeChatId || !mountedRef.current || currentChatIdRef.current !== activeChatId) return;
    setMessages((current) => {
      if (!mountedRef.current || currentChatIdRef.current !== activeChatId) return current;
      return typeof next === 'function' ? next(current) : next;
    });
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoadingChats(true);
      try {
        const { data: categoryData } = await supabase
          .from('comunicacao_categorias').select('*').order('nome', { ascending: true });
        setCategories(categoryData || []);

        const { data: chatData } = await supabase
          .from('comunicacao_chats').select('*').order('ultima_data', { ascending: false });
        setChats(chatData || []);

        const { data: unreadData } = await supabase
          .from('comunicacao_mensagens').select('chat_id').eq('lida', false)
          .in('remetente_tipo', ['aluno', 'professor']);
        setUnreadChatIds(new Set(unreadData?.map((message) => message.chat_id) || []));

        if (chatData?.length) {
          const unifiedSelection = getUnifiedSupportSelection();
          const selectedId = unifiedSelection?.channel === 'internal'
            && chatData.some((chat) => chat.id === unifiedSelection.conversationId)
            ? unifiedSelection.conversationId
            : null;
          if (selectedId || !isUnifiedSupportActive()) {
            setActiveChatId(selectedId || chatData.find((chat) => chat.status === 'pendente')?.id || chatData[0].id);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados iniciais de comunicação:', error);
      } finally {
        setLoadingChats(false);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => subscribeUnifiedSupportSelection((selection) => {
    if (selection?.channel === 'internal') setActiveChatId(selection.conversationId);
    else if (isUnifiedSupportActive()) setActiveChatId(null);
  }), []);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data } = await supabase.from('comunicacao_mensagens').select('chat_id')
          .eq('lida', false).in('remetente_tipo', ['aluno', 'professor']);
        setUnreadChatIds(new Set(data?.map((message) => message.chat_id) || []));
      } catch (error) {
        console.error('Erro ao buscar chats não lidos:', error);
      }
    };
    fetchUnread();
    const channel = supabase.channel('comunicacao_msgs_global_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comunicacao_mensagens' }, fetchUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const channel = supabase.channel('comunicacao_chats_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comunicacao_chats' }, async (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id: string }).id;
          setChats((current) => current.filter((chat) => chat.id !== oldId));
          return;
        }
        const changedId = (payload.new as { id: string }).id;
        const { data: freshChat } = await supabase.from('comunicacao_chats')
          .select('*').eq('id', changedId).single();
        if (!freshChat) return;
        setChats((current) => {
          if (payload.eventType === 'INSERT') {
            return current.some((chat) => chat.id === freshChat.id) ? current : [freshChat, ...current];
          }
          const updated = current.map((chat) => chat.id === freshChat.id ? freshChat : chat);
          return [...updated].sort((a, b) => new Date(b.ultima_data).getTime() - new Date(a.ultima_data).getTime());
        });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    let disposed = false;
    const isCurrent = () => !disposed && mountedRef.current && currentChatIdRef.current === activeChatId;
    setMessages([]);
    setLoadingMessages(Boolean(activeChatId));
    if (!activeChatId) {
      return;
    }

    const markAsRead = async () => {
      if (!isCurrent()) return;
      try {
        await supabase.from('comunicacao_mensagens').update({ lida: true })
          .eq('chat_id', activeChatId).in('remetente_tipo', ['aluno', 'professor']).eq('lida', false);
      } catch (error) {
        console.error('Erro ao marcar mensagens como lidas:', error);
      }
    };
    const loadMessages = async () => {
      try {
        const { data, error } = await supabase.from('comunicacao_mensagens').select('*')
          .eq('chat_id', activeChatId).order('created_at', { ascending: true });
        if (error) throw error;
        if (!isCurrent()) return;
        const resolvedMessages = await resolveCommunicationAttachmentUrls(data || []);
        if (isCurrent()) setMessages(resolvedMessages);
      } catch (error) {
        if (isCurrent()) console.error('Erro ao carregar mensagens:', error);
      } finally {
        if (isCurrent()) setLoadingMessages(false);
      }
    };

    loadMessages();
    const channel = supabase.channel(`comunicacao_msgs_realtime_${activeChatId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'comunicacao_mensagens', filter: `chat_id=eq.${activeChatId}`,
      }, async (payload) => {
        if (!isCurrent()) return;
        const [newMessage] = await resolveCommunicationAttachmentUrls([payload.new as GestorMessage]);
        if (!isCurrent() || !newMessage) return;
        setMessages((current) => current.some((message) => message.id === newMessage.id)
          ? current : [...current, newMessage]);
        if (newMessage.remetente_tipo === 'aluno' || newMessage.remetente_tipo === 'professor') {
          playGestorMessageSound('receive');
          markAsRead();
        }
      }).subscribe();
    markAsRead();
    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return {
    activeChatId, categories, chats, loadingChats, loadingMessages, messages, messagesEndRef,
    setActiveChatId: (id: string | null) => {
      setActiveChatId(id);
      if (id) notifyUnifiedSupportOpened({ channel: 'internal', conversationId: id });
    },
    setChats, setMessages: setMessagesForActiveChat, unreadChatIds,
  };
};
