import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContasReceber } from '../../../financeiro.types';
import { parseProescReceivableEvidence } from '../../../financeiro.proesc-evidence';
import { ReceivableCard, ReceivableRow, type ReceivableActionsContext } from './ReceivableItemPresentation';
import { paymentOriginLabel, receivableLaunchLabel } from './modalidade-receber.utils';

const item: ContasReceber = {
  id: 'synthetic', poloId: 'synthetic-polo', descricao: 'Obrigação de demonstração',
  valor: 279.9, dataVencimento: '2026-09-06', status: 'PENDENTE', categoria: 'OUTROS_CREDITOS',
  tipoLancamento: 'PARCELA', origemPagamento: 'SISTEMA_ANTERIOR', cursoNome: 'Curso de demonstração',
  proescEvidence: {
    sourceStatus: 'UNKNOWN', verification: 'REVIEW', observedAt: null,
    obligationLabel: 'Obrigação Proesc',
  },
};
const noop = () => {};
const actions: ReceivableActionsContext = {
  baneseDetailsPending: false, refreshPending: false, syncPending: false,
  onOpenPayment: noop, onCopyInvoiceUrl: noop, onOpenCharge: noop, onRefresh: noop,
  onSync: noop, onOpenPaidReceipt: noop, onOpenReversal: noop,
};

test('a fonte define o rótulo sem inferir mensalidade ou posição pela compatibilidade PARCELA', () => {
  assert.equal(receivableLaunchLabel(item), 'Obrigação Proesc');
  assert.equal(receivableLaunchLabel({ ...item, parcelaNumero: 7 }, 'fraction'), 'Obrigação Proesc');
});

test('rótulos comprovados são exibidos literalmente pelo frontend', () => {
  for (const obligationLabel of ['Rematrícula', 'Mensalidade', 'Parcela 7']) {
    assert.equal(receivableLaunchLabel({ ...item, proescEvidence: { ...item.proescEvidence!, obligationLabel } }), obligationLabel);
  }
});

test('compatibilidade T42 e identidade Banese preservam rótulos anteriores', () => {
  assert.equal(receivableLaunchLabel({ ...item, proescEvidence: undefined, tipoLancamento: 'REMATRICULA' }), 'Rematrícula');
  assert.equal(receivableLaunchLabel({ ...item, proescEvidence: { sourceStatus: 'PAID', verification: 'VERIFIED', observedAt: null } }), 'Mensalidade');
  assert.equal(receivableLaunchLabel({ ...item, gatewayProvider: 'banese_card', parcelaNumero: 7 }), 'Parcela 7');
});

test('parser preserva apenas o rótulo público limitado, sem transportar identidade privada', () => {
  const parsed = parseProescReceivableEvidence({ sourceStatus: 'UNKNOWN', obligationLabel: 'Obrigação Proesc', sourcePersonKey: 'private' });
  assert.equal(parsed?.obligationLabel, 'Obrigação Proesc');
  assert.equal(Object.hasOwn(parsed!, 'sourcePersonKey'), false);
  for (const obligationLabel of [null, '', ' ', 12, 'a'.repeat(81)]) {
    assert.equal(parseProescReceivableEvidence({ sourceStatus: 'UNKNOWN', obligationLabel })?.obligationLabel, undefined);
  }
});

test('lista e cartão mostram obrigação genérica, inclusive após pagamento confirmado', () => {
  for (const status of ['PENDENTE', 'PAGO'] as const) {
    const record = { ...item, status };
    const row = renderToStaticMarkup(createElement(ReceivableRow, { item: record, index: 0, compactStudent: true, actions }));
    const card = renderToStaticMarkup(createElement(ReceivableCard, { item: record, actions }));
    for (const html of [row, card]) {
      assert.match(html, /Obrigação Proesc/);
      assert.doesNotMatch(html, /Mensalidade|Parcela 1|1\/1/);
      if (status === 'PAGO') {
        assert.match(html, />PAGO</);
        assert.doesNotMatch(html, /em conferência/);
        assert.doesNotMatch(html, /Baixa por:|Usuário não registrado|Data e hora da baixa não registradas/);
      } else assert.match(html, /Histórico Proesc em conferência/);
    }
  }
});

test('origem Proesc comprovada não fabrica auditoria manual; banco e baixa presencial preservados', () => {
  assert.equal(paymentOriginLabel({ ...item, status: 'PAGO' }), 'Proesc');
  const bank: ContasReceber = { ...item, status: 'PAGO', gatewayProvider: 'banese_card' };
  assert.equal(paymentOriginLabel(bank), 'Banese');
  assert.doesNotMatch(renderToStaticMarkup(createElement(ReceivableCard, { item: bank, actions })), /Baixa por:|Usuário não registrado/);
  const manual: ContasReceber = {
    ...item, status: 'PAGO', origemPagamento: 'PRESENCIAL', proescEvidence: undefined,
    manualSettlementActorName: 'Operador de demonstração', manualSettlementCompletedAt: '2026-09-12T18:00:00Z',
  };
  assert.equal(paymentOriginLabel(manual), 'Manual');
  const html = renderToStaticMarkup(createElement(ReceivableCard, { item: manual, actions }));
  assert.match(html, /Baixa por:/);
  assert.match(html, /Operador de demonstração/);
  assert.match(html, /Registrada em:/);
  assert.doesNotMatch(html, /Usuário não registrado/);
});
