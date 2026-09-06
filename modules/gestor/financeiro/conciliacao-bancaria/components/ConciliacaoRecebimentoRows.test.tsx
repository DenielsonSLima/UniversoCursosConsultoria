import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConciliacaoRecebimentoRows from './ConciliacaoRecebimentoRows';
import { mapFinancialReceipt } from '../conciliacao-recebimentos.model';

const renderReceipt = (overrides: Record<string, unknown> = {}) => {
  const row = mapFinancialReceipt({
    id: 'receipt-test',
    cliente_nome: 'Pagador de teste',
    origem: 'AUTOMATICA_BANESE',
    data_pagamento: '2026-08-31',
    baixa_registrada_em: '2026-09-01T04:14:00Z',
    baixa_tempo_proveniencia: 'SISTEMA_REGISTRO',
    valor_nominal: 100,
    valor_pago: 100,
    ...overrides,
  });
  return renderToStaticMarkup(<ConciliacaoRecebimentoRows
    rows={[row]}
    refreshingIds={[]}
    isLoading={false}
    isError={false}
    isBatchSyncing={false}
    onRefresh={() => {}}
  />);
};

const fieldContents = (html: string, label: string) => (
  [...html.matchAll(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>(.*?)</dd>`, 'g'))]
    .map((match) => match[1])
);

test('desktop e celular separam pagamento de agosto da confirmação de setembro', () => {
  const html = renderReceipt();
  const payments = fieldContents(html, 'Data do pagamento');
  const confirmations = fieldContents(html, 'Baixa registrada');
  assert.equal(payments.length, 2);
  assert.equal(confirmations.length, 2);
  for (const payment of payments) {
    assert.match(payment, /31\/08\/2026/);
    assert.match(payment, /Data usada no Caixa/);
    assert.doesNotMatch(payment, /01\/09\/2026/);
  }
  for (const confirmation of confirmations) {
    assert.match(confirmation, /01\/09\/2026 às 01:14/);
    assert.match(confirmation, /Registro da confirmação no sistema/);
  }
});

test('pagamento de setembro permanece no dia bancário apesar da baixa no dia seguinte', () => {
  const html = renderReceipt({
    data_pagamento: '2026-09-01',
    baixa_registrada_em: '2026-09-02T04:14:00Z',
  });
  for (const payment of fieldContents(html, 'Data do pagamento')) {
    assert.match(payment, /01\/09\/2026/);
    assert.doesNotMatch(payment, /02\/09\/2026/);
  }
});

test('histórico sem confirmação preserva apenas a data de pagamento conhecida', () => {
  const html = renderReceipt({
    origem: 'HISTORICO_MIGRADO',
    baixa_registrada_em: null,
    baixa_tempo_proveniencia: 'HISTORICO_SEM_HORA',
  });
  for (const confirmation of fieldContents(html, 'Baixa registrada')) {
    assert.match(confirmation, /Registro não disponível/);
    assert.doesNotMatch(confirmation, /<time|31\/08\/2026/);
  }
  assert.match(fieldContents(html, 'Data do pagamento')[0], /31\/08\/2026/);
});

test('data de pagamento ausente nunca é inventada a partir da confirmação', () => {
  const html = renderReceipt({ data_pagamento: null });
  for (const payment of fieldContents(html, 'Data do pagamento')) {
    assert.match(payment, /Não informada/);
    assert.doesNotMatch(payment, /<time|01\/09\/2026/);
  }
});

test('baixa manual mantém as duas datas recebidas do backend', () => {
  const html = renderReceipt({
    origem: 'MANUAL',
    baixa_tempo_proveniencia: 'MANUAL_CONCLUSAO',
  });
  assert.match(fieldContents(html, 'Data do pagamento')[0], /31\/08\/2026/);
  assert.match(fieldContents(html, 'Baixa registrada')[0], /Conclusão da baixa manual/);
});
