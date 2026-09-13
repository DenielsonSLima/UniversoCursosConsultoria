import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FinanceiroConfigSummary from './FinanceiroConfigSummary';
import { DEFAULT_FINANCEIRO_CONFIG } from './financeiro-config.service';

const renderSummary = (somenteConsulta: boolean, somenteSegundoCiclo = false) => (
  renderToStaticMarkup(createElement(FinanceiroConfigSummary, {
    config: {
      ...DEFAULT_FINANCEIRO_CONFIG,
      valorMatricula: 200,
      valorRematricula: 100,
      qtdParcelas: 12,
      valorParcela: 279.9,
      descontoPontualidade: 19.9,
      jurosAtraso: 2,
      multaAtrasoPercentual: 2,
      diaVencimentoPadrao: 15,
    },
    calculo: {
      desconto_aplicado: 19.9,
      juros_calculados: 5.6,
      juros_percentual_dia: 0.066667,
      juros_valor_dia: 0.19,
      multa_aplicada: 5.6,
      valor_com_atraso: 291.1,
      valor_com_desconto: 260,
    },
    cronograma: [],
    turmaLabel: 'Turma sintética',
    onEdit: () => assert.fail('A apresentação não deve executar uma ação'),
    somenteConsulta,
    somenteSegundoCiclo,
  }))
);

test('turma com ciclos externos mantém valores e encargos visíveis sem edição', () => {
  const html = renderSummary(true);
  for (const value of ['200,00', '100,00', '279,90', '19,90', '260,00', '5,60', '0,19']) {
    assert.ok(html.includes(value), `Condição financeira ${value} ausente`);
  }
  assert.match(html, /12x por ciclo/);
  assert.match(html, /2% ao mês/);
  assert.match(html, /não informa quitação/);
  assert.match(html, /Os títulos já emitidos seguem os valores do sistema de origem/);
  assert.doesNotMatch(html, /<button|Cronograma de Cobrança|Clique em Editar/);
});

test('consulta prevalece sobre o atalho de continuidade do segundo ciclo', () => {
  const html = renderSummary(true, true);
  assert.match(html, /Sem novas cobranças neste sistema/);
  assert.doesNotMatch(html, /Somente o 2º ciclo|ao gerar o 2º ciclo|<button/);
});

test('turma com segundo ciclo permitido conserva acesso à edição e à orientação', () => {
  const html = renderSummary(false, true);
  assert.match(html, /<button/);
  assert.match(html, /Editar/);
  assert.match(html, /Somente o 2º ciclo/);
  assert.doesNotMatch(html, /Sem novas cobranças neste sistema/);
});
