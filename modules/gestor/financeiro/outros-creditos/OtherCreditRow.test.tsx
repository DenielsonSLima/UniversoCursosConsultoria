import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtherCreditRow } from './OtherCreditRow';
import type { ContasReceber } from '../financeiro.types';

const item = {
  id: 'proesc-receipt', poloId: 'polo', descricao: 'Mensalidade importada',
  valor: 279.90, valorPago: 260, dataVencimento: '2026-09-16',
  dataPagamento: '2026-09-04', status: 'PAGO', categoria: 'OUTROS_CREDITOS',
  origemPagamento: 'SISTEMA_ANTERIOR', clienteNome: 'Aluno de teste',
  descontoAplicado: 19.90, jurosAplicados: 0, multaAplicada: 0,
  acrescimoAplicado: 0, diferencaNaoDiscriminada: 0,
  composicaoStatus: 'CALCULADO_REGRA_INFORMADA_PROESC',
} as ContasReceber;
const model = {
  openReceiveModal() {}, openPaymentModal() {}, copyLink() {},
  syncMutation: { isPending: false, mutate() {} },
  refreshMutation: { isPending: false, mutate() {} },
};
const render = (receipt: ContasReceber) => renderToStaticMarkup(
  <table><tbody><OtherCreditRow item={receipt} index={0} model={model as any} /></tbody></table>,
).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('Outros Créditos discrimina Proesc sem exigir identificador Banese', () => {
  const text = render(item);
  assert.match(text, /Origem: Proesc/);
  assert.match(text, /Desconto: R\$ 19,90/);
  assert.match(text, /Juros: R\$ 0,00/);
  assert.match(text, /Multa: R\$ 0,00/);
  assert.match(text, /Recebido: R\$ 260,00/);
  assert.match(text, /Calculado pelas regras informadas/);
  assert.doesNotMatch(text, /Gerar link|Desconto expirado|Conta local/);
});

test('divergência calculada fica visível e não substitui o recebido', () => {
  const text = render({ ...item, valorPago: 250, diferencaNaoDiscriminada: -10 });
  assert.match(text, /Recebido: R\$ 250,00/);
  assert.match(text, /Diferença (?:não discriminada|a conferir): -R\$ 10,00/);
  assert.match(text, /Desconto: R\$ 19,90/);
});


test('cobrança importada pendente não oferece nova emissão ou caixa Banese', () => {
  const text = render({ ...item, status: 'PENDENTE' });
  assert.doesNotMatch(text, /Gerar link|Abrir caixa/);
});

test('cobrança Banese permite abrir o caixa existente', () => {
  const text = render({ ...item, origemPagamento: 'BANESE', gatewayProvider: 'banese_card', asaasPaymentId: 'bank-id', status: 'PENDENTE' });
  assert.match(text, /Abrir caixa/);
  assert.doesNotMatch(text, /Gerar link/);
});
