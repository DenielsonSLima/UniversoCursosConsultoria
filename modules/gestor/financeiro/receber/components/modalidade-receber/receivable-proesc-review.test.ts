import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceivableStatusBadge } from './ReceivableItemPresentation';
import type { ContasReceber } from '../../../financeiro.types';

const item: ContasReceber = {
  id: 'synthetic', poloId: 'synthetic-polo', descricao: 'Mensalidade', valor: 279.9,
  dataVencimento: '2026-09-06', status: 'PENDENTE', categoria: 'MENSALIDADE',
  origemPagamento: 'SISTEMA_ANTERIOR',
  proescEvidence: { sourceStatus: 'UNKNOWN', verification: 'REVIEW', observedAt: null },
};
const badge = (overrides: Partial<ContasReceber> = {}) => renderToStaticMarkup(
  createElement(ReceivableStatusBadge, { item: { ...item, ...overrides } }),
);

test('pendência operacional Proesc mostra conferência em vez de afirmar aberto', () => {
  const html = badge();
  assert.match(html, /Histórico Proesc em conferência/);
  assert.doesNotMatch(html, />PENDENTE<|>VENCIDO<|aberto confirmado/);
});

test('pagamento aplicado e Banese mantêm apresentação existente', () => {
  assert.match(badge({ status: 'PAGO', valorPago: 260, dataPagamento: '2026-09-08' }), />PAGO</);
  assert.doesNotMatch(badge({ status: 'PAGO' }), /em conferência/);
  assert.match(badge({ gatewayProvider: 'banese_card' }), />PENDENTE</);
  assert.doesNotMatch(badge({ gatewayProvider: 'banese_card' }), /Proesc/);
});

test('Proesc aberto verificado e legado não identificado conservam status normal', () => {
  assert.match(badge({ proescEvidence: { sourceStatus: 'OPEN', verification: 'VERIFIED', observedAt: null } }), />PENDENTE</);
  assert.doesNotMatch(badge({ proescEvidence: undefined }), /Proesc/);
});
