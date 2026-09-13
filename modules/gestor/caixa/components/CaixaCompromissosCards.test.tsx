import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaixaCompromissosCards } from './CaixaCompromissosCards';
import type { CaixaMonthlyStatement } from '../caixa.types';

const renderCards = (receberVencido: number, margemInadimplencia: number, completo = true,
  receitasFuturas?: CaixaMonthlyStatement['compromissos']['receitasFuturas']) => (
  renderToStaticMarkup(<CaixaCompromissosCards compromissos={{
    aReceber: 100000, receberVencido, margemInadimplencia, aPagar: 200, pagarVencido: 30,
    receitasFuturas,
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
  assert.match(html, /Apurado na base conferida até 31\/07\/2026/);
  assert.match(html, /Inadimplência do mês \(parcial\)/);
  assert.match(html, /Margem de inadimplência do mês \(parcial\)/);
  assert.match(html, /Base conferida da margem/);
  assert.match(html, /Sobre a base conferida do mês/);
  assert.match(html, /1.500,00/);
  assert.match(html, /2 cobrança\(s\) em conferência não incluída\(s\)/);
  assert.match(html, /500,00 em valor nominal/);
  assert.match(html, /Esse valor ainda não representa inadimplência confirmada/);
  assert.doesNotMatch(renderCards(125, 17.23), /Indicadores incompletos/);
});

test('zero parcial não parece ausência definitiva de inadimplência', () => {
  const html = renderCards(0, 0, false);
  assert.match(html, /0,00/);
  assert.match(html, /0%/);
  assert.match(html, /Inadimplência do mês \(parcial\)/);
  assert.match(html, /Margem de inadimplência do mês \(parcial\)/);
  assert.match(html, /500,00 em valor nominal/);
  const complete = renderCards(0, 0);
  assert.doesNotMatch(complete, /\(parcial\)|em valor nominal|base conferida/);
  assert.match(complete, /Não recebido até 31\/07\/2026/);
});

test('receitas futuras usa valor confirmado canônico, inclusive zero, e distingue conferência atual da mensal', () => {
  const future = {
    valorConfirmado: 0, quantidadeElegiveis: 0, quantidadeEmConferencia: 7,
    valorNominalEmConferencia: 1750, completo: false,
    criterio: 'OBRIGACOES_ABERTAS_COMPROVADAS_POSICAO_ATUAL' as const,
  };
  const html = renderCards(125, 17.23, false, future);
  assert.match(html, /Receitas futuras confirmadas/);
  assert.match(html, /Obrigações abertas hoje · 7 cobrança\(s\) em conferência/);
  assert.match(html, /0,00/);
  assert.doesNotMatch(html, /100.000,00|1.750,00/);
  assert.match(html, /2 cobrança\(s\) em conferência não incluída\(s\)/);
  const complete = renderCards(125, 17.23, true, { ...future,
    valorConfirmado: 350, quantidadeElegiveis: 2, quantidadeEmConferencia: 0,
    valorNominalEmConferencia: 0, completo: true,
  });
  assert.match(complete, /350,00/);
  assert.doesNotMatch(complete, /cobrança\(s\) em conferência|100.000,00/);
  assert.doesNotMatch(renderCards(125, 17.23), /Receitas futuras confirmadas/);
});
