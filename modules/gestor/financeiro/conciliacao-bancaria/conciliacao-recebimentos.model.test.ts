import assert from 'node:assert/strict';
import test from 'node:test';

import {
  channelToFinancialReceiptOrigin,
  mapFinancialReceipt,
  mapFinancialReceiptCounts,
  shouldUseFinancialReceiptsFeed,
} from './conciliacao-recebimentos.model.ts';

const baseParams = {
  environment: 'production' as const,
  page: 1,
  pageSize: 20,
};

test('usa o feed unificado somente para recebimentos e origens de baixa', () => {
  assert.equal(shouldUseFinancialReceiptsFeed({
    ...baseParams,
    status: 'PAGO',
    canal: 'TODOS',
  }), true);
  assert.equal(shouldUseFinancialReceiptsFeed({
    ...baseParams,
    status: 'TODOS',
    canal: 'HISTORICO_MIGRADO',
  }), true);
  assert.equal(shouldUseFinancialReceiptsFeed({
    ...baseParams,
    status: 'VENCIDO',
    canal: 'TODOS',
  }), false);
});

test('mapeia baixa manual sem recalcular a composição no cliente', () => {
  const receipt = mapFinancialReceipt({
    id: '10000000-0000-4000-8000-000000000001',
    descricao: 'Mensalidade 2/12',
    origem: 'MANUAL',
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
    total: 263,
    automatica_banese: 48,
    manual: 26,
    historico_migrado: 189,
    cnab240: 0,
    mercado_pago: 0,
    outro: 0,
  });

  assert.equal(counts.totalCount, 263);
  assert.equal(counts.apiCount, 48);
  assert.equal(counts.caixaCount, 26);
  assert.equal(counts.historicoCount, 189);
  assert.equal(channelToFinancialReceiptOrigin('HISTORICO_MIGRADO'), 'HISTORICO_MIGRADO');
  assert.equal(channelToFinancialReceiptOrigin('CAIXA_MANUAL'), 'MANUAL');
});
