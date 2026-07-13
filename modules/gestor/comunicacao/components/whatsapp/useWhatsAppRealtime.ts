import { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../../../../../lib/supabase';
import { playIncomingWhatsAppSound } from './inbox/notificationSound';

const messageConversationId = (payload: any) =>
  String(payload?.new?.conversa_id || payload?.old?.conversa_id || '').trim();

export const useWhatsAppRealtime = (queryClient: QueryClient) => {
  useEffect(() => {
    const channel = supabase
      .channel('whatsapp_inbox_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_mensagens' }, (payload) => {
        const conversationId = messageConversationId(payload);
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
        queryClient.invalidateQueries({ queryKey: conversationId ? ['whatsapp', 'mensagens', conversationId] : ['whatsapp', 'mensagens'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
        if (payload.eventType === 'INSERT' && payload.new?.direcao === 'entrada') playIncomingWhatsAppSound();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_message_usage' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_billing_settings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_flow_settings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'fluxos'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_flow_sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'fluxos'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
