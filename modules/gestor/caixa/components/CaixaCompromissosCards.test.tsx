import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaixaCompromissosCards } from './CaixaCompromissosCards';

const renderCards = (receberVencido: number, margemInadimplencia: number, completo = true) => (
  renderToStaticMarkup(<CaixaCompromissosCards compromissos={{
    aReceber: 100000, receberVencido, margemInadimplencia, aPagar: 200, pagarVencido: 30,
    inadimplenciaMensal: {
      periodoInicio: '2026-07-01', periodoFimExclusivo: '2026-08-01', dataCorte: '2026-07-31',
      baseElegivel: 1500, quantidadeElegiveis: 10, quantidadeEmConferencia: completo ? 0 : 2,
      valorNominalEmConferencia: completo ? 0 : 500, completo,
      criterio: 'VENCIMENTO_MENSAL_POSICAO_NO_CORTE',
    },
  }} />)
);

test('indicadores exibem valor e percentual do servidor sem usar a carteira futura como base', () => {
  const html = renderCards(125, 17.23);
  assert.match(html, /125,00/);
  assert.match(html, /17,23%/);
  assert.doesNotMatch(html, /0,125%/);
  assert.match(html, /100.000,00/);
  assert.match(html, /200,00/);
  assert.match(html, /30,00/);
});

test('novo payload do mês ou polo substitui os dois indicadores sem reaproveitar o anterior', () => {
  const first = renderCards(125, 17.23);
  const next = renderCards(80, 4.56);
  assert.match(first, /125,00/);
  assert.match(next, /80,00/);
  assert.match(next, /4,56%/);
  assert.doesNotMatch(next, /125,00|17,23%/);
});

test('explicita mês, data de referência, base e registros ainda em conferência', () => {
  const html = renderCards(125, 17.23, false);
  assert.match(html, /Inadimplência do mês/);
  assert.match(html, /Margem de inadimplência do mês/);
  assert.match(html, /Não recebido até 31\/07\/2026/);
  assert.match(html, /1.500,00/);
  assert.match(html, /2 cobrança\(s\) em conferência não incluída\(s\)/);
  assert.doesNotMatch(renderCards(125, 17.23), /Indicadores incompletos/);
});
