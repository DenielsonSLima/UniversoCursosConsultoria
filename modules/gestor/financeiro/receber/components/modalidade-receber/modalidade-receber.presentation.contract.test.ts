import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceivableActionButtons, type ReceivableActionsContext } from './ReceivableItemPresentation';
import type { ContasReceber } from '../../../financeiro.types';

const operationsSource = await readFile(new URL('./useModalidadeReceberOperations.ts', import.meta.url), 'utf8');
const noop = () => {};
const actions: ReceivableActionsContext = {
  baneseDetailsPending: false, refreshPending: false, syncPending: false,
  onOpenPayment: noop, onCopyInvoiceUrl: noop, onOpenCharge: noop, onRefresh: noop,
  onSync: noop, onOpenPaidReceipt: noop, onOpenReversal: noop,
};
const renderActions = (overrides: Partial<ContasReceber> = {}) => renderToStaticMarkup(createElement(
  ReceivableActionButtons, { actions, item: {
    id: 'test', poloId: 'polo', descricao: 'Parcela', valor: 100, dataVencimento: '2030-01-01',
    status: 'PENDENTE', categoria: 'MENSALIDADE', gatewayProvider: 'banese_card', ...overrides,
  } },
));

test('quarentena não oferece envio bancário nem libera o documento', () => {
  const html = renderActions({ asaasLastError: 'BANESE_IDENTITY_QUARANTINED: teste' });
  assert.doesNotMatch(html, /Enviar ao banco|Regularizar|Reemitir|>Abrir</);
});

test('título Banese existente nunca cai na ação de enviar ao banco', () => {
  const html = renderActions();
  assert.match(html, /Abrir/);
  assert.doesNotMatch(html, /Enviar ao banco/);
});

test('sincronização ignorada não apresenta confirmação bancária falsa', () => {
  const skippedGuard = operationsSource.indexOf('const skipped =');
  const successToast = operationsSource.indexOf("toast.success('Cobrança enviada'");

  assert.notEqual(skippedGuard, -1);
  assert.notEqual(successToast, -1);
  assert.ok(skippedGuard < successToast);
  assert.match(operationsSource, /asaas_sync_skipped === true/);
  assert.match(operationsSource, /toast\.info\([\s\S]*?'Cobrança não enviada'/);
});
