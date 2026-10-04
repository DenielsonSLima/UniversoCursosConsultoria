import { useEffect, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { whatsappService } from './components/whatsapp/whatsapp.service';
import type { WhatsAppConversation } from './components/whatsapp/whatsapp.types';
import type { GestorCategory, GestorChat } from './gestor-comunicacao.types';
import { mergeUnifiedSupportItems } from './unified-support-inbox.model';

interface UseUnifiedSupportInboxOptions {
  canAccessInternal: boolean;
  canAccessWhatsApp: boolean;
}

interface InternalInboxSnapshot {
  chats: GestorChat[];
  categories: GestorCategory[];
  unreadChatIds: string[];
  auxiliaryError: unknown;
}

const combineWhatsAppQueries = (queries: UseQueryResult<WhatsAppConversation[]>[]) => ({
  conversations: queries.flatMap((query) => query.data || []),
  loading: queries.some((query) => query.isLoading),
  error: queries.find((query) => query.error)?.error,
});

const loadInternalInbox = async (): Promise<InternalInboxSnapshot> => {
  const [chatsResult, unreadResult, categoriesResult] = await Promise.all([
    supabase.from('comunicacao_chats').select('*').order('ultima_data', { ascending: false }),
    supabase.from('comunicacao_mensagens').select('chat_id').eq('lida', false)
      .in('remetente_tipo', ['aluno', 'professor']),
    supabase.from('comunicacao_categorias').select('*').order('nome', { ascending: true }),
  ]);
  if (chatsResult.error) throw chatsResult.error;
  return {
    chats: (chatsResult.data || []) as GestorChat[],
    categories: (categoriesResult.data || []) as GestorCategory[],
    unreadChatIds: [...new Set((unreadResult.data || []).map((message) => String(message.chat_id)))],
    auxiliaryError: unreadResult.error || categoriesResult.error,
  };
};

export const useUnifiedSupportInbox = ({
  canAccessInternal,
  canAccessWhatsApp,
}: UseUnifiedSupportInboxOptions) => {
  const queryClient = useQueryClient();
  const internalQuery = useQuery({
    queryKey: ['unified-support', 'internal-inbox'],
    queryFn: loadInternalInbox,
    enabled: canAccessInternal,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const connectionsQuery = useQuery({
    queryKey: ['whatsapp_conexoes'],
    queryFn: whatsappService.getConexoes,
    enabled: canAccessWhatsApp,
    staleTime: 30_000,
  });
  const connections = useMemo(() => canAccessWhatsApp ? connectionsQuery.data || [] : [],
    [canAccessWhatsApp, connectionsQuery.data]);
  const whatsappQueries = useQueries({
    queries: connections.map((connection) => ({
      queryKey: ['whatsapp', connection.id, 'conversas'],
      queryFn: () => whatsappService.getConversations(connection.id),
      staleTime: 0,
      refetchOnMount: 'always' as const,
      refetchOnWindowFocus: true,
    })),
    combine: combineWhatsAppQueries,
  });

  useEffect(() => {
    if (!canAccessInternal) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['unified-support', 'internal-inbox'] });
    };
    const channel = supabase.channel('unified_support_internal_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comunicacao_chats' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comunicacao_mensagens' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [canAccessInternal, queryClient]);

  useEffect(() => {
    if (!canAccessWhatsApp) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'], predicate: (query) => query.queryKey[2] === 'conversas' });
    };
    const channel = supabase.channel('unified_support_whatsapp_inbox')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'whatsapp_conversas',
      }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_mensagens' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [canAccessWhatsApp, queryClient]);

  const items = useMemo(() => mergeUnifiedSupportItems({
    internalChats: canAccessInternal ? internalQuery.data?.chats : [],
    unreadInternalChatIds: new Set(internalQuery.data?.unreadChatIds || []),
    whatsappConversations: whatsappQueries.conversations,
    whatsappConnectionNames: Object.fromEntries(connections.map((connection) => [connection.id, connection.nome])),
  }), [
    connections,
    canAccessInternal,
    canAccessWhatsApp,
    internalQuery.data,
    whatsappQueries.conversations,
  ]);

  return {
    items,
    connections,
    categories: canAccessInternal ? internalQuery.data?.categories || [] : [],
    loading: (canAccessInternal && internalQuery.isLoading)
      || (canAccessWhatsApp && connectionsQuery.isLoading) || whatsappQueries.loading,
    error: (canAccessInternal && (internalQuery.error || internalQuery.data?.auxiliaryError))
      || (canAccessWhatsApp && connectionsQuery.error) || whatsappQueries.error,
  };
};
