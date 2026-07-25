import test from 'node:test';
import {
  isWhatsAppConnectionReady,
  isWhatsAppConnectionOutboundReady,
  isWhatsAppConnectionWebhookReady,
  type WhatsAppConexao,
} from './whatsapp.types.ts';

const baseConnection: WhatsAppConexao = {
  id: 'connection-id',
  nome: 'Universo Principal',
  instituicao: 'universo',
  telefone: '+5579999999999',
  phone_number_id: 'phone-id',
  waba_id: 'waba-id',
  is_default: true,
  is_matriz_financeira: true,
  status: 'ativo',
  connection_mode: 'cloud_api',
  graph_version: 'v25.0',
  app_id: 'app-id',
  token_configured: true,
  app_secret_configured: true,
  verify_token_configured: true,
  webhook_verified_at: '2026-07-24T12:00:00.000Z',
  waba_subscribed_at: '2026-07-24T12:00:00.000Z',
  created_at: '2026-07-24T12:00:00.000Z',
  updated_at: '2026-07-24T12:00:00.000Z',
};

test('considera Cloud API pronta para envio sem exigir credenciais de webhook', () => {
  if (!isWhatsAppConnectionReady(baseConnection)) {
    throw new Error('A conexão completa deveria estar pronta.');
  }
  if (!isWhatsAppConnectionReady({
    ...baseConnection,
    app_id: null,
    app_secret_configured: false,
    verify_token_configured: false,
    webhook_verified_at: null,
  })) {
    throw new Error('A Cloud API deve ficar pronta para envio sem configurar o webhook.');
  }
  if (!isWhatsAppConnectionReady({
    ...baseConnection,
    waba_id: null,
    waba_subscribed_at: null,
  })) {
    throw new Error('O envio Cloud API não depende da WABA nem da assinatura do webhook.');
  }
  if (!isWhatsAppConnectionOutboundReady(baseConnection)) {
    throw new Error('A capacidade de envio deveria estar disponível.');
  }
  if (!isWhatsAppConnectionWebhookReady(baseConnection)) {
    throw new Error('A capacidade de webhook deveria estar disponível.');
  }
  if (isWhatsAppConnectionWebhookReady({
    ...baseConnection,
    waba_subscribed_at: null,
  })) {
    throw new Error('Webhook sem assinatura da WABA não pode ficar pronto.');
  }
});

test('exige confirmação adicional da Meta no modo coexistência', () => {
  const coexistence = {
    ...baseConnection,
    connection_mode: 'coexistence' as const,
  };
  if (isWhatsAppConnectionReady(coexistence)) {
    throw new Error('Coexistência sem confirmação não pode ficar pronta.');
  }
  if (isWhatsAppConnectionReady({
    ...coexistence,
    waba_subscribed_at: null,
    coexistence_verified_at: '2026-07-24T12:00:00.000Z',
  })) {
    throw new Error('Coexistência sem webhook completo não pode ficar pronta.');
  }
  if (!isWhatsAppConnectionReady({
    ...coexistence,
    coexistence_verified_at: '2026-07-24T12:00:00.000Z',
  })) {
    throw new Error('Coexistência confirmada e com webhook deveria estar pronta.');
  }
});
