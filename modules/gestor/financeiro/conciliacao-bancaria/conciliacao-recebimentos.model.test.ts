import assert from 'node:assert/strict';
import test from 'node:test';

import {
  channelToFinancialReceiptOrigin,
  mapFinancialReceipt,
  mapFinancialReceiptCounts,
} from './conciliacao-recebimentos.model.ts';

test('preserva origem e pendência de conferência recebidas do servidor', () => {
  const receipt = mapFinancialReceipt({
    id: 'obligation-example', origem: 'PROESC', status: 'PENDENTE',
    source_system: 'PROESC', source_label: 'Proesc',
    status_label: 'Em conferência (Proesc)', source_verification: 'REVIEW',
    valor_nominal: 279.9, valor_pago: null, desconto_aplicado: null,
  });
  assert.equal(receipt.status, 'PENDENTE');
  assert.equal(receipt.sourceSystem, 'PROESC');
  assert.equal(receipt.statusLabel, 'Em conferência (Proesc)');
  assert.equal(receipt.sourceVerification, 'REVIEW');
  assert.equal(receipt.canalBaixa, 'PROESC');
  assert.equal(receipt.valorPago, undefined);
  assert.equal(receipt.descontoAplicado, null);
  assert.equal(mapFinancialReceipt({}).status, 'PENDENTE');
  assert.equal(channelToFinancialReceiptOrigin('PROESC'), 'PROESC');
});

test('mapeia baixa manual sem recalcular a composição no cliente', () => {
  const receipt = mapFinancialReceipt({
    id: '10000000-0000-4000-8000-000000000001',
    descricao: 'Mensalidade 2/12',
    origem: 'MANUAL',
    status: 'PAGO',
    cliente_nome: 'Aluno Teste',
    cliente_cpf_cnpj: '***.***.***-12',
    data_pagamento: '2026-08-30',
    baixa_registrada_em: '2026-08-30T15:30:00-03:00',
    valor_nominal: 279.9,
    valor_pago: 284.9,
    juros_aplicados: 2,
    multa_aplicada: 3,
    acrescimo_aplicado: 0,
    desconto_aplicado: 0,
    composicao_status: 'COMPOSICAO_EXPLICITA',
    conta_recebedora_nome: 'BANESE · Ag. 004 · Conta 00006490-0',
  });

  assert.equal(receipt.status, 'PAGO');
  assert.equal(receipt.canalBaixa, 'CAIXA_MANUAL');
  assert.equal(receipt.clienteDocumentoMascarado, '***.***.***-12');
  assert.equal(receipt.valorPago, 284.9);
  assert.equal(receipt.jurosAplicados, 2);
  assert.equal(receipt.multaAplicada, 3);
  assert.equal(receipt.contaRecebedoraNome, 'BANESE · Ag. 004 · Conta 00006490-0');
});

test('preserva ausência de hora e composição no histórico migrado', () => {
  const receipt = mapFinancialReceipt({
    id: '10000000-0000-4000-8000-000000000002',
    origem: 'HISTORICO_MIGRADO',
    status: 'PAGO',
    data_pagamento: '2026-01-10',
    baixa_registrada_em: null,
    valor_nominal: 100,
    valor_pago: 90,
    juros_aplicados: null,
    multa_aplicada: null,
    desconto_aplicado: null,
    diferenca_nao_discriminada: -10,
    composicao_status: 'HISTORICO_SEM_COMPOSICAO',
    composicao_proveniencia: 'HISTORICO_SEM_DETALHAMENTO',
  });

  assert.equal(receipt.canalBaixa, 'HISTORICO_MIGRADO');
  assert.equal(receipt.baixaRegistradaEm, undefined);
  assert.equal(receipt.jurosAplicados, null);
  assert.equal(receipt.descontoAplicado, null);
  assert.equal(receipt.diferencaNaoDiscriminada, -10);
  assert.equal(receipt.composicaoStatus, 'HISTORICO_SEM_COMPOSICAO');
  assert.equal(receipt.composicaoProveniencia, 'HISTORICO_SEM_DETALHAMENTO');
});

test('mapeia contagens e filtros de origem sem misturar histórico com manual', () => {
  const counts = mapFinancialReceiptCounts({
    total: 283,
    proesc: 20,
    pendente: 7,
    automatica_banese: 48,
    manual: 26,
    historico_migrado: 189,
    cnab240: 0,
    mercado_pago: 0,
    outro: 0,
  });

  assert.equal(counts.totalCount, 283);
  assert.equal(counts.apiCount, 48);
  assert.equal(counts.proescCount, 20);
  assert.equal(counts.pendenteCount, 7);
  assert.equal(counts.caixaCount, 26);
  assert.equal(counts.historicoCount, 189);
  assert.equal(channelToFinancialReceiptOrigin('HISTORICO_MIGRADO'), 'HISTORICO_MIGRADO');
  assert.equal(channelToFinancialReceiptOrigin('CAIXA_MANUAL'), 'MANUAL');
});

test('consulta à API usa somente campo canônico Proesc sem substituir a baixa ou pagamento', () => {
  const timestamp = '2026-09-16T18:20:00.123456+00:00';
  const receipt = mapFinancialReceipt({
    source_system: 'PROESC', proesc_evidence: { apiConsultedAt: timestamp },
    baixa_registrada_em: null, data_pagamento: '2026-08-31',
  });
  assert.equal(receipt.proescConsultadoEm, timestamp);
  assert.equal(receipt.baixaRegistradaEm, undefined);
  assert.equal(receipt.dataPagamento, '2026-08-31');
  assert.equal(mapFinancialReceipt({
    source_system: 'BANESE', proesc_evidence: { apiConsultedAt: timestamp },
  }).proescConsultadoEm, undefined);
});

test('observação genérica ou timestamp inválido não vira horário de consulta à API', () => {
  for (const apiConsultedAt of [
    undefined, null, '', 'not-a-date', '2026-09-16', '2026-09-16T18:20:00',
    '2026-02-30T18:20:00Z', '2026-09-16T25:20:00Z', 0, {},
  ]) {
    const receipt = mapFinancialReceipt({
      source_system: 'PROESC',
      proesc_evidence: { observedAt: '2026-09-16T18:20:00Z', apiConsultedAt },
      gateway_synced_at: '2026-09-16T18:21:00Z',
    });
    assert.equal(receipt.proescConsultadoEm, undefined);
    assert.equal(receipt.baixaRegistradaEm, undefined);
  }
});
