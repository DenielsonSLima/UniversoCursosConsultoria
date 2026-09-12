import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CaixaMonthlyStatement } from '../caixa.service';
import { CaixaMovimentacaoChart } from './CaixaMovimentacaoChart';

type Month = CaixaMonthlyStatement['serieMensal'][number];
const month = (overrides: Partial<Month> = {}): Month => ({
  competencia: '2026-07-01', rotulo: 'Jul/26', entradas: 1000, saidas: 1200,
  resultado: -200, resultadoStatus: 'NEGATIVO', entradasEscalaPercentual: 50,
  saidasEscalaPercentual: 60, inadimplencia: 300, inadimplenciaEscalaPercentual: 15,
  inadimplenciaQuantidadeEmConferencia: 0, inadimplenciaCompleto: true,
  resultadoPosicaoPercentual: 85, inadimplenciaPosicaoPercentual: 45,
  graficoZeroPosicaoPercentual: 75, ...overrides,
});
const renderChart = (months: Month[]) => renderToStaticMarkup(<CaixaMovimentacaoChart serieMensal={months} />);

test('linha laranja, legenda e tooltip exibem inadimplência enviada pela RPC', () => {
  const html = renderChart([month()]);
  assert.match(html, /Receitas, despesas, resultado e inadimplência dos últimos três meses/);
  assert.match(html, /data-series="inadimplencia" points="50,45"[^>]*stroke="#f97316"/);
  assert.match(html, /Inadimplência R\$\s*300,00/);
  assert.match(html, /inadimplência R\$\s*300,00/);
  assert.match(html, /tabindex="0"/);
});

test('posições e alturas do servidor compartilham baseline sem escala financeira no cliente', () => {
  const html = renderChart([month()]);
  assert.match(html, /points="50,85"/);
  assert.match(html, /y1="75"[^>]*y2="75"/);
  assert.match(html, /height:50%;bottom:25%/);
  assert.match(html, /height:60%;bottom:25%/);
  assert.match(html, /top:45%/);
});

test('mostra inadimplência mesmo sem receitas ou despesas', () => {
  const html = renderChart([month({ entradas: 0, saidas: 0, resultado: 0 })]);
  assert.match(html, /data-series="inadimplencia"/);
  assert.doesNotMatch(html, /Nenhuma movimentação/);
});

test('valor zero com registros em conferência mantém gráfico e aviso acessível de parcialidade', () => {
  const html = renderChart([month({ entradas: 0, saidas: 0, resultado: 0, inadimplencia: 0,
    inadimplenciaCompleto: false, inadimplenciaQuantidadeEmConferencia: 4 })]);
  assert.match(html, /valor parcial: 4 cobrança\(s\) em conferência não incluída\(s\)/);
  assert.match(html, /Valor parcial: 4 cobrança\(s\) em conferência não incluída\(s\)/);
  assert.match(html, /data-series="inadimplencia"/);
  assert.doesNotMatch(html, /Nenhuma movimentação/);
});
