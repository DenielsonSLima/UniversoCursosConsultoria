import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { resolveCommunicationAttachmentUrls } from '../../shared/comunicacao/comunicacao-attachments.service';
import {
  GestorCategory,
  GestorChat,
  GestorMessage,
  playGestorMessageSound,
} from './gestor-comunicacao.types';

export const useGestorComunicacaoRealtime = () => {
  const [chats, setChats] = useState<GestorChat[]>([]);
  const [messages, setMessages] = useState<GestorMessage[]>([]);
  const [categories, setCategories] = useState<GestorCategory[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(new Set());
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          setActiveChatId(chatData.find((chat) => chat.status === 'pendente')?.id || chatData[0].id);
        }
      } catch (error) {
        console.error('Erro ao carregar dados iniciais de comunicação:', error);
      } finally {
        setLoadingChats(false);
      }
    };
    loadInitialData();
  }, []);

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
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const markAsRead = async () => {
      try {
        await supabase.from('comunicacao_mensagens').update({ lida: true })
          .eq('chat_id', activeChatId).in('remetente_tipo', ['aluno', 'professor']).eq('lida', false);
      } catch (error) {
        console.error('Erro ao marcar mensagens como lidas:', error);
      }
    };
    const loadMessages = async () => {
      setLoadingMessages(true);
      try {
        const { data, error } = await supabase.from('comunicacao_mensagens').select('*')
          .eq('chat_id', activeChatId).order('created_at', { ascending: true });
        if (error) throw error;
        setMessages(await resolveCommunicationAttachmentUrls(data || []));
      } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
      } finally {
        setLoadingMessages(false);
      }
    };

    loadMessages();
    const channel = supabase.channel(`comunicacao_msgs_realtime_${activeChatId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'comunicacao_mensagens', filter: `chat_id=eq.${activeChatId}`,
      }, async (payload) => {
        const [newMessage] = await resolveCommunicationAttachmentUrls([payload.new as GestorMessage]);
        setMessages((current) => current.some((message) => message.id === newMessage.id)
          ? current : [...current, newMessage]);
        if (newMessage.remetente_tipo === 'aluno' || newMessage.remetente_tipo === 'professor') {
          playGestorMessageSound('receive');
          markAsRead();
        }
      }).subscribe();
    markAsRead();
    return () => { supabase.removeChannel(channel); };
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return {
    activeChatId, categories, chats, loadingChats, loadingMessages, messages, messagesEndRef,
    setActiveChatId, setChats, setMessages, unreadChatIds,
  };
};
