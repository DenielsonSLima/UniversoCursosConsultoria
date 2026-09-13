import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContasReceber } from '../../../financeiro.types';
import { mapReceivableFinancialComposition } from '../../../financeiro.composition-presentation';
import { ReceivableAmountSummary } from './ReceivableAmountSummary';
import { receivableDiscountPresentation } from './modalidade-receber.utils';
import { financialReportValueToText } from '../../../components/financial-report.vector-pdf.resources';

const receivable = (source: Record<string, unknown>): ContasReceber => ({
  poloId: 'test-polo', descricao: 'Mensalidade sintética', categoria: 'MENSALIDADE',
  status: 'PAGO', valor: 279.9, valorPago: 260, dataVencimento: '2026-09-15',
  ...mapReceivableFinancialComposition(source),
});

test('composição calculada apresenta componentes canônicos, recebido real e origem sem Nosso Número', () => {
  const item = receivable({
    composicao_status: 'CALCULADO_REGRA_INFORMADA_PROESC',
    composicao_proveniencia: 'REGRA_INFORMADA_USUARIO',
    desconto_aplicado: '19.90', juros_aplicados: '0.00', multa_aplicada: 0,
    acrescimo_aplicado: '0.00', diferenca_nao_discriminada: 0,
  });
  assert.equal(item.boletoNossoNumero, undefined);
  assert.deepEqual(receivableDiscountPresentation(item), { kind: 'APLICADO', value: 19.9 });
  const html = renderToStaticMarkup(<ReceivableAmountSummary item={item} compact />);
  assert.match(html, /19,90/);
  assert.match(html, /260,00/);
  assert.match(html, /Juros:.*0,00/);
  assert.match(html, /Multa:.*0,00/);
  assert.match(html, /Calculado pelas regras informadas/);
  assert.doesNotMatch(html, /Composição conferida|Não informado|Diferença não discriminada/);
  const pdfText = financialReportValueToText(<ReceivableAmountSummary item={item} compact />);
  assert.match(pdfText, /Desconto: R\$ 19,90/);
  assert.match(pdfText, /Recebido: R\$ 260,00/);
  assert.match(pdfText, /Calculado pelas regras informadas/);
});

test('composição mista mostra diferenças residuais sem recalcular o pagamento', () => {
  const item = receivable({
    composicao_status: 'API_E_REGRA_INFORMADA_PROESC',
    desconto_aplicado: 19.9, juros_aplicados: 1.71, multa_aplicada: 5.2,
    acrescimo_aplicado: 0, diferenca_nao_discriminada: -6.91,
  });
  const html = renderToStaticMarkup(<ReceivableAmountSummary item={item} />);
  assert.match(html, /Dados Proesc complementados pelas regras informadas/);
  assert.match(html, /Diferença não discriminada:.*6,91/);
  assert.match(html, /1,71/);
  assert.match(html, /5,20/);
  assert.match(html, /Recebido:.*260,00/);
  assert.doesNotMatch(html, /266,91|Composição conferida/);
});

test('resposta parcial preserva campos ausentes e residual informado', () => {
  const item = receivable({
    composicao_status: 'PARCIAL_POR_API_PROESC',
    desconto_aplicado: null, juros_aplicados: 1.71, multa_aplicada: 5.2,
    acrescimo_aplicado: null, diferenca_nao_discriminada: -26.81,
  });
  const html = renderToStaticMarkup(<ReceivableAmountSummary item={item} compact />);
  assert.match(html, /Desconto:.*Não informado/);
  assert.match(html, /Acréscimos:.*Não informado/);
  assert.match(html, /26,81/);
  assert.doesNotMatch(html, /Calculado pelas regras|Composição conferida/);
});

test('mapper não converte ausência, strings vazias ou números inválidos em zero', () => {
  const result = mapReceivableFinancialComposition({
    desconto_aplicado: null, juros_aplicados: '', multa_aplicada: Number.NaN,
    acrescimo_aplicado: Infinity, diferenca_nao_discriminada: '-0.01',
  });
  assert.equal(result.descontoAplicado, undefined);
  assert.equal(result.jurosAplicados, undefined);
  assert.equal(result.multaAplicada, undefined);
  assert.equal(result.acrescimoAplicado, undefined);
  assert.equal(result.diferencaNaoDiscriminada, -0.01);
});

test('sem composição canônica não transforma diferença de pagamento em desconto', () => {
  const item = receivable({});
  assert.equal(receivableDiscountPresentation(item), null);
  const html = renderToStaticMarkup(<ReceivableAmountSummary item={item} />);
  assert.match(html, /279,90/);
  assert.match(html, /260,00/);
  assert.doesNotMatch(html, /19,90|Calculado pelas regras|Desconto aplicado/);
});
