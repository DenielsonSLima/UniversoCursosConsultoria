import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConciliacaoRecebimentoRows from './ConciliacaoRecebimentoRows';
import { mapFinancialReceipt } from '../conciliacao-recebimentos.model';

const renderReceipt = (overrides: Record<string, unknown> = {}) => {
  const row = mapFinancialReceipt({
    id: 'receipt-test',
    status: 'PAGO',
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

test('Proesc em conferência exibe rótulo do servidor e não oferece consulta Banese', () => {
  const html = renderReceipt({
    status: 'PENDENTE',
    source_system: 'PROESC',
    source_label: 'Proesc',
    status_label: 'Histórico Proesc em conferência',
    origem: 'PROESC',
  });
  assert.match(html, /Histórico Proesc em conferência/);
  assert.doesNotMatch(html, /Re-verificar|na API Banese|Automática · Banese/);
});

test('Proesc pago preserva valor e componentes desconhecidos recebidos do servidor', () => {
  const html = renderReceipt({
    status: 'PAGO', source_system: 'PROESC', source_label: 'Proesc',
    status_label: 'Pago', origem: 'PROESC', valor_pago: 260,
    desconto_aplicado: null, juros_aplicados: null, multa_aplicada: null,
  });
  assert.match(html, /Proesc/);
  assert.match(fieldContents(html, 'Valor pago')[0], /260,00/);
  assert.match(fieldContents(html, 'Desconto')[0], /Não informado/);
  assert.doesNotMatch(html, /Manual · Caixa|Histórico migrado|Re-verificar/);
});

test('consulta individual permanece disponível somente para cobrança Banese pendente', () => {
  const html = renderReceipt({ status: 'PENDENTE', source_system: 'BANESE', status_label: 'Pendente' });
  assert.match(html, /Re-verificar/);
  assert.match(html, /na API Banese/);
});

test('composição Proesc parcial mostra valores explícitos e informa conferência dos demais', () => {
  const html = renderReceipt({
    status: 'PAGO', source_system: 'PROESC', source_label: 'Proesc', origem: 'PROESC',
    composicao_status: 'PARCIAL_POR_API_PROESC',
    valor_nominal: 279.9, valor_pago: 260, juros_aplicados: 1.71, multa_aplicada: 5.2,
    desconto_aplicado: null, acrescimo_aplicado: null, diferenca_nao_discriminada: -26.81,
  });
  assert.match(html, /Componentes informados pelo Proesc/);
  assert.match(fieldContents(html, 'Juros')[0], /1,71/);
  assert.match(fieldContents(html, 'Multa')[0], /5,20/);
  assert.match(fieldContents(html, 'Desconto')[0], /Não informado/);
  assert.match(html, /Diferença não discriminada:.*26,81/);
  assert.doesNotMatch(html, /Composição conferida no Proesc/);
});

test('regras calculadas e mistas exibem origem e diferença sem afirmar conferência Proesc', () => {
  for (const [status, label] of [
    ['CALCULADO_REGRA_INFORMADA_PROESC', 'Calculado pelas regras informadas'],
    ['API_E_REGRA_INFORMADA_PROESC', 'Dados Proesc complementados pelas regras informadas'],
  ]) {
    const html = renderReceipt({
      status: 'PAGO', source_system: 'PROESC', source_label: 'Proesc', origem: 'PROESC',
      composicao_status: status, valor_nominal: 279.9, valor_pago: 260,
      desconto_aplicado: 19.9, juros_aplicados: 1.71, multa_aplicada: 5.2,
      acrescimo_aplicado: 0, diferenca_nao_discriminada: -6.91,
    });
    assert.ok(html.includes(label));
    assert.match(fieldContents(html, 'Valor pago')[0], /260,00/);
    assert.match(fieldContents(html, 'Desconto')[0], /19,90/);
    assert.match(html, /Diferença não discriminada:.*6,91/);
    assert.doesNotMatch(html, /Composição conferida no Proesc|266,91/);
  }
});

test('composição completa do servidor aparece nas duas apresentações sem fabricar metadados Proesc', () => {
  for (const [status, label] of [
    ['CALCULADO_REGRA_INFORMADA_PROESC', 'Calculado pelas regras informadas'],
    ['API_E_REGRA_INFORMADA_PROESC', 'Dados Proesc complementados pelas regras informadas'],
    ['CONCILIADO_POR_CONFERENCIA_PROESC', 'Composição conferida no Proesc'],
  ]) {
    const html = renderReceipt({
      status: 'PAGO', source_system: 'PROESC', source_label: 'Proesc', origem: 'PROESC',
      composicao_status: status, valor_nominal: 279.9, valor_pago: 260,
      desconto_aplicado: 19.9, juros_aplicados: 0, multa_aplicada: 0,
      acrescimo_aplicado: 0, diferenca_nao_discriminada: 0,
      baixa_registrada_em: null, baixa_tempo_proveniencia: 'HISTORICO_SEM_HORA',
      gateway_synced_at: '2026-09-16T18:20:00Z', forma_pagamento: null,
      conta_recebedora_nome: null,
    });
    assert.ok(html.includes(label));
    for (const [field, expected] of [
      ['Valor pago', /260,00/], ['Desconto', /19,90/], ['Juros', /0,00/],
      ['Multa', /0,00/], ['Acréscimos', /0,00/],
    ] as const) {
      const values = fieldContents(html, field);
      assert.equal(values.length, 2, `${field}: desktop e celular`);
      for (const value of values) {
        assert.match(value, expected);
        assert.doesNotMatch(value, /Não informado/);
      }
    }
    for (const confirmation of fieldContents(html, 'Baixa registrada')) {
      assert.match(confirmation, /Horário não disponível na integração Proesc/);
      assert.doesNotMatch(confirmation, /<time|16\/09\/2026|18:20|15:20/);
    }
    for (const field of ['Forma', 'Conta recebedora']) {
      for (const value of fieldContents(html, field)) assert.match(value, /Não informada/);
    }
    assert.doesNotMatch(html, /Diferença não discriminada|Composição não informada/);
    if (status !== 'CONCILIADO_POR_CONFERENCIA_PROESC') {
      assert.doesNotMatch(html, /Composição conferida no Proesc/);
    }
  }
});

test('origem Proesc com horário efetivamente informado preserva o registro retornado', () => {
  const html = renderReceipt({ source_system: 'PROESC', origem: 'PROESC' });
  for (const confirmation of fieldContents(html, 'Baixa registrada')) {
    assert.match(confirmation, /01\/09\/2026 às 01:14/);
    assert.doesNotMatch(confirmation, /Horário não disponível na integração Proesc/);
  }
});
