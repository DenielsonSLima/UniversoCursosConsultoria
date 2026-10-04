import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterUnifiedSupportItems,
  mergeUnifiedSupportItems,
} from './unified-support-inbox.model.ts';
import type { GestorChat } from './gestor-comunicacao.types.ts';
import type { WhatsAppConversation } from './components/whatsapp/whatsapp.types.ts';

const internalChat = {
  id: 'internal-1',
  remetente_id: 'student-1',
  remetente_nome: 'Aluno do App',
  remetente_tipo: 'Aluno',
  categoria_id: null,
  status: 'pendente',
  ultimo_texto: 'Mensagem interna',
  ultima_data: '2026-10-04T01:30:00.000Z',
  created_at: '2026-10-04T01:29:00.000Z',
  updated_at: '2026-10-04T01:30:00.000Z',
  origem: 'app',
} satisfies GestorChat;

const whatsappConversation = {
  id: 'whatsapp-1',
  aluno_id: null,
  contato_nome: 'Contato WhatsApp',
  contato_foto: null,
  telefone: '5579999999999',
  status: 'aberta',
  ultimo_texto: 'Mensagem externa',
  ultima_data: '2026-10-04T01:31:00.000Z',
  unread_count: 2,
  conexao_id: 'connection-1',
} satisfies WhatsAppConversation;

test('mistura os canais pela atividade mais recente e preserva a origem', () => {
  const items = mergeUnifiedSupportItems({
    internalChats: [internalChat],
    unreadInternalChatIds: new Set(['internal-1']),
    whatsappConversations: [whatsappConversation],
    whatsappConnectionId: 'connection-1',
    whatsappConnectionName: 'Universo Principal',
  });

  assert.deepEqual(items.map((item) => item.key), [
    'whatsapp:connection-1:whatsapp-1',
    'internal:internal-1',
  ]);
  assert.equal(items[0].sourceLabel, 'WhatsApp');
  assert.equal(items[0].unread, 2);
  assert.equal(items[1].sourceLabel, 'App');
  assert.equal(items[1].unread, 1);
});

test('aplica um único filtro de status e busca para todos os canais', () => {
  const closedPortal = {
    ...internalChat,
    id: 'internal-closed',
    remetente_nome: 'Visitante Portal',
    status: 'solucionada' as const,
    origem: 'portal' as const,
  };
  const items = mergeUnifiedSupportItems({
    internalChats: [internalChat, closedPortal],
    whatsappConversations: [whatsappConversation],
  });

  assert.deepEqual(
    filterUnifiedSupportItems(items, 'open', 'whatsapp').map((item) => item.conversationId),
    ['whatsapp-1'],
  );
  assert.deepEqual(
    filterUnifiedSupportItems(items, 'closed', 'portal').map((item) => item.key),
    ['internal:internal-closed'],
  );
});

test('preserva a linha de cada WhatsApp sem colidir com IDs de outros canais', () => {
  const items = mergeUnifiedSupportItems({
    internalChats: [{ ...internalChat, id: 'same-id' }],
    whatsappConversations: [
      { ...whatsappConversation, id: 'same-id' },
      { ...whatsappConversation, id: 'same-id', conexao_id: 'connection-2' },
    ],
    whatsappConnectionNames: { 'connection-1': 'Universo Principal', 'connection-2': 'Outra linha' },
  });
  assert.equal(new Set(items.map((item) => item.key)).size, 3);
  assert.equal(items.find((item) => item.connectionId === 'connection-1')?.connectionName, 'Universo Principal');
  assert.equal(items.find((item) => item.connectionId === 'connection-2')?.connectionName, 'Outra linha');
  assert.equal(filterUnifiedSupportItems(items, 'open', 'outra linha').length, 1);
});

test('categoria interna não mistura conversas WhatsApp nem elimina o filtro Todas', () => {
  const items = mergeUnifiedSupportItems({
    internalChats: [{ ...internalChat, categoria_id: 'category-1' }],
    whatsappConversations: [whatsappConversation],
  });
  assert.deepEqual(filterUnifiedSupportItems(items, 'open', '', 'category-1').map((item) => item.key), ['internal:internal-1']);
  assert.equal(filterUnifiedSupportItems(items, 'open', '', null).length, 2);
});
