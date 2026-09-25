import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceivableActionButtons, type ReceivableActionsContext } from './ReceivableItemPresentation';
import type { ContasReceber } from '../../../financeiro.types';

const unexpectedAction = () => assert.fail('Renderização não deve executar ação financeira');
const actions: ReceivableActionsContext = {
  baneseDetailsPending: false,
  refreshPending: false,
  syncPending: false,
  onOpenPayment: unexpectedAction,
  onCopyInvoiceUrl: unexpectedAction,
  onOpenCharge: unexpectedAction,
  onRefresh: unexpectedAction,
  onSync: unexpectedAction,
  onOpenPaidReceipt: unexpectedAction,
  onOpenReversal: unexpectedAction,
};

const receivable = (overrides: Partial<ContasReceber> = {}): ContasReceber => ({
  id: 'synthetic-receivable',
  poloId: 'synthetic-polo',
  descricao: 'Mensalidade de teste',
  valor: 250,
  dataVencimento: '2030-01-15',
  status: 'PENDENTE',
  categoria: 'MENSALIDADE',
  ...overrides,
});

const renderActions = (item: ContasReceber) => renderToStaticMarkup(
  createElement(ReceivableActionButtons, { item, actions }),
);

test('legado sem gateway exibe origem externa e não oferece nova emissão bancária', () => {
  for (const status of ['PENDENTE', 'VENCIDO'] as const) {
    const html = renderActions(receivable({ status, origemPagamento: 'SISTEMA_ANTERIOR' }));
    assert.match(html, /Cobrança do sistema anterior/);
    assert.doesNotMatch(html, /Enviar ao banco/);
    assert.doesNotMatch(html, /Proesc/);
    assert.match(html, /Receber/);
  }
});

test('legado já vinculado ao Banese conserva abertura do boleto existente', () => {
  const html = renderActions(receivable({
    origemPagamento: 'SISTEMA_ANTERIOR',
    gatewayProvider: 'banese',
  }));
  assert.match(html, /Abrir/);
  assert.match(html, /PDF do boleto Banese/);
  assert.doesNotMatch(html, /Cobrança do sistema anterior|Enviar ao banco/);
});

test('cobrança nova sem gateway mantém envio ao banco', () => {
  const html = renderActions(receivable());
  assert.match(html, /Enviar ao banco/);
  assert.doesNotMatch(html, /Cobrança do sistema anterior/);
});

test('parcela gerada pela turma orienta retomada e nunca oferece envio avulso ou abertura prematura', () => {
  for (const emissaoCicloStatus of ['PENDENTE', 'REVISAO', undefined] as const) {
    for (const gatewayProvider of [undefined, 'banese_card']) {
      const html = renderActions(receivable({
        emissaoGerenciadaTurma: true, emissaoCicloStatus, gatewayProvider,
      }));
      assert.match(html, /Emissão não concluída/);
      assert.match(html, /Gestão → Turma → Financeiro/);
      assert.match(html, /Retomar emissão/);
      assert.match(html, /Receber/);
      assert.doesNotMatch(html, /Enviar ao banco|>Abrir</);
    }
  }
});

test('matrícula local continua recebível sem oferecer qualquer emissão bancária', () => {
  const html = renderActions(receivable({ destinoCobranca: 'LOCAL', emissaoGerenciadaTurma: true }));
  assert.match(html, /Sem boleto|Receber/);
  assert.doesNotMatch(html, /Enviar ao banco|Retomar emissão|>Abrir</);
});

test('ciclo em revisão informa acompanhamento sem sugerir repetir emissão bancária', () => {
  const html = renderActions(receivable({ emissaoGerenciadaTurma: true, emissaoCicloStatus: 'REVISAO_MANUAL' }));
  assert.match(html, /Emissão em revisão/);
  assert.match(html, /Acompanhe esta cobrança/);
  assert.doesNotMatch(html, /Enviar ao banco|Retomar emissão/);
});

test('boleto nativo concluído mantém abertura e jamais reapresenta envio genérico', () => {
  for (const gatewayProvider of ['banese_card', undefined]) {
    const html = renderActions(receivable({
      emissaoGerenciadaTurma: true, emissaoCicloStatus: 'EMITIDO', gatewayProvider,
    }));
    assert.match(html, gatewayProvider ? /Abrir/ : /Boleto emitido/);
    assert.doesNotMatch(html, /Enviar ao banco|Retomar emissão/);
  }
});
