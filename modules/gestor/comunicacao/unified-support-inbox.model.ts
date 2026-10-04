import type { WhatsAppConversation } from './components/whatsapp/whatsapp.types';
import type { GestorChat } from './gestor-comunicacao.types';

export type UnifiedSupportChannel = 'internal' | 'whatsapp';
export type UnifiedSupportSource = 'app' | 'portal' | 'whatsapp';
export type UnifiedSupportStatus = 'open' | 'closed';

export interface UnifiedSupportItem {
  key: string;
  channel: UnifiedSupportChannel;
  source: UnifiedSupportSource;
  sourceLabel: 'App' | 'Portal' | 'WhatsApp';
  conversationId: string;
  connectionId: string | null;
  connectionName: string | null;
  categoryId: string | null;
  name: string;
  phone: string | null;
  lastText: string;
  lastAt: string;
  status: UnifiedSupportStatus;
  unread: number;
}

interface MergeUnifiedSupportInput {
  internalChats?: GestorChat[];
  unreadInternalChatIds?: Set<string>;
  whatsappConversations?: WhatsAppConversation[];
  whatsappConnectionId?: string | null;
  whatsappConnectionName?: string | null;
  whatsappConnectionNames?: Record<string, string>;
}

const timestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const mergeUnifiedSupportItems = ({
  internalChats = [],
  unreadInternalChatIds = new Set<string>(),
  whatsappConversations = [],
  whatsappConnectionId = null,
  whatsappConnectionName = null,
  whatsappConnectionNames = {},
}: MergeUnifiedSupportInput): UnifiedSupportItem[] => {
  const internalItems: UnifiedSupportItem[] = internalChats.map((chat) => {
    const source = chat.origem === 'app' ? 'app' : 'portal';
    return {
      key: `internal:${chat.id}`,
      channel: 'internal',
      source,
      sourceLabel: source === 'app' ? 'App' : 'Portal',
      conversationId: chat.id,
      connectionId: null,
      connectionName: null,
      categoryId: chat.categoria_id,
      name: chat.remetente_nome,
      phone: null,
      lastText: chat.ultimo_texto || 'Sem mensagens...',
      lastAt: chat.ultima_data,
      status: chat.status === 'pendente' ? 'open' : 'closed',
      unread: unreadInternalChatIds.has(chat.id) ? 1 : 0,
    };
  });

  const whatsappItems: UnifiedSupportItem[] = whatsappConversations.map((conversation) => ({
    key: `whatsapp:${conversation.conexao_id || whatsappConnectionId || 'default'}:${conversation.id}`,
    channel: 'whatsapp',
    source: 'whatsapp',
    sourceLabel: 'WhatsApp',
    conversationId: conversation.id,
    connectionId: conversation.conexao_id || whatsappConnectionId,
    connectionName: whatsappConnectionNames[conversation.conexao_id || whatsappConnectionId || ''] || whatsappConnectionName,
    categoryId: null,
    name: conversation.contato_nome,
    phone: conversation.telefone,
    lastText: conversation.ultimo_texto || 'Sem mensagens...',
    lastAt: conversation.ultima_data,
    status: conversation.status === 'aberta' ? 'open' : 'closed',
    unread: Number(conversation.unread_count || 0),
  }));

  return [...internalItems, ...whatsappItems]
    .sort((left, right) => timestamp(right.lastAt) - timestamp(left.lastAt));
};

export const filterUnifiedSupportItems = (
  items: UnifiedSupportItem[],
  status: UnifiedSupportStatus,
  search: string,
  categoryId: string | null = null,
) => {
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const phoneTerm = /^[\d\s()+.-]+$/.test(term) ? term.replace(/\D/g, '') : '';
  return items.filter((item) => {
    if (item.status !== status) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (!term) return true;
    if (phoneTerm && item.phone?.replace(/\D/g, '').includes(phoneTerm)) return true;
    return [item.name, item.phone, item.lastText, item.sourceLabel, item.connectionName]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('pt-BR')
      .includes(term);
  });
};
