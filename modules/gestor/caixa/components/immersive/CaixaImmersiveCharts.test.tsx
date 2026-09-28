import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CaixaVisualizacoes } from '../../caixa.types';
import { CaixaImmersiveBalanceDistribution } from './CaixaImmersiveBalanceDistribution';
import { CaixaImmersiveComboChart } from './CaixaImmersiveComboChart';
import { CaixaImmersiveDonutChart } from './CaixaImmersiveDonutChart';

const visual: CaixaVisualizacoes = {
  versao: 1,
  janelaMeses: 6,
  movimentacao: {
    viewBox: '0 0 100 100',
    dominioMinimo: '-10.00',
    dominioMaximo: '100.00',
    baseY: 90,
    resultadoPontos: '10,40 30,50',
    inadimplenciaPontos: '10,60 30,55',
    meses: [{
      competencia: '2026-09-01', rotulo: 'Set/2026', x: 10, baseY: 90,
      entradaX: 4, saidaX: 10, entradaY: 20, saidaY: 70, largura: 5,
      entradasValor: '100.00', saidasValor: '20.00', resultadoValor: '80.00',
      inadimplenciaValor: '30.00', entradasAltura: 70, saidasAltura: 20,
      resultadoY: 40, inadimplenciaY: 60,
    }],
  },
  composicao: {
    receitas: { total: '100.00', itens: [{
      codigo: 'TECNICO', rotulo: 'Cursos técnicos', valor: '100.00', quantidade: 2,
      percentual: 100, inicioPercentual: 0, comprimentoPercentual: 100,
      offsetPercentual: 0, gapPercentual: 0,
    }] },
    despesas: { total: '0.00', itens: [] },
  },
  saldosPorConta: { totalPositivo: '150.00', itens: [{
    id: 'conta-1', banco: 'BANESE', conta: '123', titular: 'Universo', natureza: 'BANCARIA',
    valor: '150.00', percentual: 100, inicioPercentual: 0, comprimentoPercentual: 100,
    offsetPercentual: 0, gapPercentual: 0,
  }] },
};

test('gráfico combinado consome coordenadas e linhas canônicas sem recalcular a série', () => {
  const html = renderToStaticMarkup(
    <CaixaImmersiveComboChart
      chartId="movimento"
      title="Movimentação"
      description="Seis meses"
      accessibleSummary="Resumo acessível"
      movimentacao={visual.movimentacao}
    />,
  );

  assert.match(html, /viewBox="0 0 100 100"/);
  assert.match(html, /data-chart-bar="2026-09-01-entradas" x="4" y="20" width="5" height="70"/);
  assert.match(html, /data-chart-line="resultado" points="10,40 30,50"/);
  assert.match(html, /Entradas R\$\s*100,00/);
});

test('rosca e distribuição respeitam segmentos cumulativos vindos do RPC', () => {
  const donut = renderToStaticMarkup(
    <CaixaImmersiveDonutChart
      chartId="receitas"
      title="Receitas"
      description="Por modalidade"
      accessibleSummary="Receitas por modalidade"
      composition={visual.composicao.receitas}
      centerLabel="Receitas"
    />,
  );
  const balances = renderToStaticMarkup(
    <CaixaImmersiveBalanceDistribution
      distributionId="saldos"
      title="Saldos"
      description="Por conta"
      accessibleSummary="Saldos por conta"
      totalLabel="Total"
      distribution={visual.saldosPorConta}
    />,
  );

  assert.match(donut, /stroke-dasharray="100 0"/);
  assert.match(donut, /2 movimentos/);
  assert.match(balances, /data-balance-segment="conta-1"/);
  assert.match(balances, /left:0%;width:100%/);
});

test('componentes visuais não contêm cálculo financeiro ou geométrico', () => {
  for (const file of [
    'CaixaImmersiveComboChart.tsx',
    'CaixaImmersiveDonutChart.tsx',
    'CaixaImmersiveBalanceDistribution.tsx',
  ]) {
    const source = readFileSync(join(process.cwd(), 'modules/gestor/caixa/components/immersive', file), 'utf8');
    assert.doesNotMatch(source, /\.reduce\(|Math\.|parseFloat|parseInt/);
    assert.doesNotMatch(source, /\b(valor|percentual|entrada|saida|resultado)\s*[-+*/]/i);
  }
});
