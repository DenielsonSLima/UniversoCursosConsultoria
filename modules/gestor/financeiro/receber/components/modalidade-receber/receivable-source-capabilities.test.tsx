import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceivableActionButtons, ReceivableCard, ReceivableRow, ReceivableStatusBadge, type ReceivableActionsContext } from './ReceivableItemPresentation';
import { ReceivablesResultTotal, ReceivablesSummaryCards } from './ReceivablesSummaryCards';
import { mapReceivableFinancialComposition } from '../../../financeiro.composition-presentation';
import { parseBaneseCancellation, parseReceivableOperationCapabilities } from '../../../financeiro.operation-capabilities';
import type { ContasReceber, ReceivablesSummary } from '../../../financeiro.types';

const unexpected = () => assert.fail('A apresentação não executa operações');
const actions: ReceivableActionsContext = {
  baneseDetailsPending: false, refreshPending: false, syncPending: false,
  onOpenPayment: unexpected, onCopyInvoiceUrl: unexpected, onOpenCharge: unexpected,
  onRefresh: unexpected, onSync: unexpected, onOpenPaidReceipt: unexpected, onOpenReversal: unexpected,
};
const item = (overrides: Partial<ContasReceber> = {}): ContasReceber => ({
  id: 'synthetic', poloId: 'synthetic-polo', descricao: 'Parcela', valor: 279.9,
  dataVencimento: '2030-10-05', status: 'PENDENTE', categoria: 'MENSALIDADE', ...overrides,
});
const renderActions = (row: ContasReceber) => renderToStaticMarkup(createElement(ReceivableActionButtons, { item: row, actions }));

test('Proesc comprovado é somente consulta em aberto, vencido e pago', () => {
  for (const status of ['PENDENTE', 'VENCIDO', 'PAGO'] as const) {
    const html = renderActions(item({ status, proescEvidence: { sourceStatus: 'PAID', verification: 'VERIFIED', observedAt: null } }));
    assert.match(html, /somente consulta/);
    assert.doesNotMatch(html, /<button|Receber|Recibo Universo|Estornar baixa|Enviar ao banco/);
  }
});

test('capability canônica protege Proesc e conflito mesmo sem projeção antiga', () => {
  for (const sourceSystem of ['PROESC', 'CONFLICT']) {
    const operationCapabilities = parseReceivableOperationCapabilities({
      sourceSystem, provenanceKind: sourceSystem === 'PROESC' ? 'PROESC_HISTORY' : 'CONFLICT',
    });
    const html = renderActions(item({ gatewayProvider: 'banese', operationCapabilities }));
    assert.doesNotMatch(html, /<button/);
  }
});

test('Banese importado mantém operação existente sem oferecer nova emissão', () => {
  const operationCapabilities = parseReceivableOperationCapabilities({
    sourceSystem: 'BANESE', provenanceKind: 'BANESE_LEGACY_IMPORTED',
    canSettle: true, canOpenExisting: true, canCancel: true, canReconcile: true,
  });
  const html = renderActions(item({ gatewayProvider: 'banese', operationCapabilities }));
  assert.match(html, /Receber/);
  assert.match(html, /Abrir/);
  assert.doesNotMatch(html, /Enviar ao banco/);
});

test('não transforma ausência de metadado ou strings em autorização', () => {
  assert.equal(parseReceivableOperationCapabilities(null), undefined);
  assert.equal(parseReceivableOperationCapabilities({ sourceSystem: 'INVENTADO' }), undefined);
  assert.equal(parseReceivableOperationCapabilities({ sourceSystem: 'LOCAL', provenanceKind: 'LOCAL', canSettle: 'true' })?.canSettle, false);
  assert.equal(parseBaneseCancellation({ state: 'CANCELED' }), undefined);
  for (const operationCapabilities of [undefined, parseReceivableOperationCapabilities({
    sourceSystem: 'LOCAL', provenanceKind: 'LOCAL', canSettle: 'true', canEmit: 'true',
  })]) {
    const html = renderActions(item({ operationCapabilities }));
    assert.doesNotMatch(html, /title="Confirmar recebimento manual"|Enviar ao banco/);
  }
});

test('capabilities negativas impedem Abrir Banese e emissão local', () => {
  const operationCapabilities = parseReceivableOperationCapabilities({
    sourceSystem: 'BANESE', provenanceKind: 'BANESE_LEGACY_IMPORTED',
    canSettle: false, canOpenExisting: false, canEmit: false,
  });
  const bank = renderActions(item({ gatewayProvider: 'banese_card', operationCapabilities }));
  assert.doesNotMatch(bank, /<button|Abrir|Enviar ao banco/);
  const local = renderActions(item({ operationCapabilities: parseReceivableOperationCapabilities({
    sourceSystem: 'LOCAL', provenanceKind: 'LOCAL', canSettle: true, canEmit: false,
  }) }));
  assert.match(local, /Receber/);
  assert.doesNotMatch(local, /Enviar ao banco/);
});

test('capability explícita permite emissão local sem ampliar recebimento', () => {
  const html = renderActions(item({ operationCapabilities: parseReceivableOperationCapabilities({
    sourceSystem: 'LOCAL', provenanceKind: 'LOCAL', canSettle: false, canEmit: true,
  }) }));
  assert.match(html, /Enviar ao banco/);
  assert.doesNotMatch(html, /title="Confirmar recebimento manual"/);
});

test('consulta de comprovante/link Asaas existente permanece disponível', () => {
  const html = renderActions(item({ gatewayProvider: 'asaas', asaasInvoiceUrl: 'https://example.invalid/invoice',
    operationCapabilities: parseReceivableOperationCapabilities({
      sourceSystem: 'OTHER', provenanceKind: 'OTHER', canSettle: true,
    }),
  }));
  assert.match(html, /Abrir/);
  assert.match(html, /Consultar status atual no banco configurado/);
  assert.doesNotMatch(html, /Enviar ao banco/);
});

test('trancamento distingue aguardo, revisão e cancelamento confirmado', () => {
  for (const [state, label] of [
    ['PENDING', 'Cancelamento aguardando Banese'],
    ['PROCESSING', 'Cancelamento aguardando Banese'],
    ['REVIEW_REQUIRED', 'Cancelamento em revisão'],
    ['CANCELED', 'CANCELADO'],
  ] as const) {
    const row = item({ status: state === 'CANCELED' ? 'CANCELADO' : 'SUSPENSO', ...mapReceivableFinancialComposition({
      banese_cancellation: { state, reason: 'TRANCAMENTO_FUTURO', movementId: 'synthetic-movement', cutoffDate: '2030-09-05' },
    }) });
    const badge = renderToStaticMarkup(createElement(ReceivableStatusBadge, { item: row }));
    assert.match(badge, new RegExp(label));
    assert.doesNotMatch(renderActions(row), /<button/);
  }
});

test('pagamento confirmado prevalece sobre metadado de cancelamento defasado', () => {
  const row = item({ status: 'PAGO', baneseCancellation: {
    state: 'PENDING', reason: 'TRANCAMENTO_FUTURO', movementId: 'synthetic', cutoffDate: '2030-09-05',
  } });
  assert.match(renderToStaticMarkup(createElement(ReceivableStatusBadge, { item: row })), /PAGO/);
  assert.doesNotMatch(renderActions(row), /Cancelamento aguardando/);
});

test('compra EAD opcional vencida tem o mesmo rótulo na tabela e no cartão', () => {
  const row = item({
    cursoModalidade: 'EAD', optionalEadCheckoutStatus: 'AWAITING_BANK_VERIFICATION',
    gatewayProvider: 'banese_card',
    operationCapabilities: parseReceivableOperationCapabilities({
      sourceSystem: 'BANESE', provenanceKind: 'BANESE_LEGACY_IMPORTED', canSettle: true, canOpenExisting: true,
    }),
  });
  const tableRow = createElement('table', null, createElement('tbody', null, createElement(ReceivableRow, { item: row, index: 0, actions })));
  for (const presentation of [tableRow, createElement(ReceivableCard, { item: row, actions })]) {
    const html = renderToStaticMarkup(presentation);
    assert.match(html, /Compra opcional/);
    assert.match(html, /Aguardando conferência bancária/);
    assert.match(html, /title="Confirmar recebimento manual"/);
    assert.match(html, />Abrir</);
    assert.doesNotMatch(html, /Compra expirada|Enviar ao banco/);
  }
});

test('expiração exige estado canônico e preserva recebimento parcial, suspensão e pagamento confirmado', () => {
  const renderBadge = (row: ContasReceber) => renderToStaticMarkup(createElement(ReceivableStatusBadge, { item: row }));
  const expired = item({ status: 'CANCELADO', optionalEadCheckoutStatus: 'EXPIRED' });
  assert.match(renderBadge(expired), /Compra expirada/);
  assert.doesNotMatch(renderActions(expired), /<button/);
  assert.match(renderBadge(item({ status: 'CANCELADO' })), /CANCELADO/);
  assert.match(renderBadge(item({ status: 'PAGO', optionalEadCheckoutStatus: 'EXPIRED' })), /PAGO/);
  assert.match(renderBadge(item({ status: 'SUSPENSO', optionalEadCheckoutStatus: 'PENDING' })), /Compra opcional.*Suspenso/);
  const partial = item({
    optionalEadCheckoutStatus: 'AWAITING_BANK_VERIFICATION',
    paymentSummary: { originalAmount: '279.90', previouslyPaid: '10.00', remainingBefore: '269.90', status: 'PENDENTE', hasEvents: true },
  });
  assert.match(renderBadge(partial), /Compra opcional.*Baixa parcial/);
  assert.match(renderActions(partial), /Histórico de pagamentos/);
});

test('total e cartão A vencer descrevem a parte opcional sem misturar outros escopos', () => {
  const data: ReceivablesSummary = {
    pendingCount: 2, pendingValue: 199.9, pendingOptionalCheckout: { count: 1, value: 99.9 },
    receivedCount: 1, receivedValue: 100, canceledCount: 1, canceledValue: 75, overdueCount: 1, overdueValue: 100,
    allCount: 4, allValue: 374.9,
  };
  const state = { data, loading: false, error: false };
  const onlyOptional = { ...state, data: { ...data, pendingCount: 1, pendingValue: 99.9 } };
  assert.match(renderToStaticMarkup(createElement(ReceivablesResultTotal, { scope: 'pending', state })), /199,90.*incluindo R\$\s99,90 em compras opcionais/);
  assert.match(renderToStaticMarkup(createElement(ReceivablesResultTotal, { scope: 'pending', state: onlyOptional })), /99,90<\/strong> em compras opcionais/);
  assert.match(renderToStaticMarkup(createElement(ReceivablesResultTotal, { scope: 'overdue', state })), /100,00<\/strong> em aberto/);
  const cards = renderToStaticMarkup(createElement(ReceivablesSummaryCards, {
    scope: 'upcoming', summary: state, upcoming: onlyOptional, onScopeChange: unexpected, disabled: false,
  }));
  assert.match(cards, /Compras opcionais com vencimento hoje ou depois/);
});
