import { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../../../../../lib/supabase';
import { playIncomingWhatsAppSound } from './inbox/notificationSound';

const messageConversationId = (payload: any) =>
  String(payload?.new?.conversa_id || payload?.old?.conversa_id || '').trim();

export const useWhatsAppRealtime = (
  queryClient: QueryClient,
  connectionId?: string | null,
) => {
  useEffect(() => {
    if (!connectionId) return;
    const channel = supabase
      .channel(`whatsapp_inbox_realtime_${connectionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversas', filter: `conexao_id=eq.${connectionId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_mensagens' }, async (payload) => {
        const conversationId = messageConversationId(payload);
        if (!conversationId) return;
        const { data: selectedConversation } = await supabase
          .from('whatsapp_conversas')
          .select('id')
          .eq('id', conversationId)
          .eq('conexao_id', connectionId)
          .maybeSingle();
        if (!selectedConversation) return;

        queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'mensagens', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
        if (payload.eventType === 'INSERT' && payload.new?.direcao === 'entrada') playIncomingWhatsAppSound();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_message_usage' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_billing_settings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_flow_settings', filter: `conexao_id=eq.${connectionId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'fluxos'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_flow_sessions' }, async (payload) => {
        const next = payload.new as Record<string, unknown>;
        const previous = payload.old as Record<string, unknown>;
        const conversationId = String(next?.conversa_id || previous?.conversa_id || '').trim();
        if (!conversationId) return;
        const { data: selectedConversation } = await supabase
          .from('whatsapp_conversas')
          .select('id')
          .eq('id', conversationId)
          .eq('conexao_id', connectionId)
          .maybeSingle();
        if (!selectedConversation) return;

        queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'fluxos'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [connectionId, queryClient]);
};
