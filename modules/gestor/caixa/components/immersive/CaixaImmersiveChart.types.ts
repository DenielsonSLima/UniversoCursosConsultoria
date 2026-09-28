import type { CaixaVisualizacoes } from '../../caixa.types';

export type CaixaImmersiveMonthlyVisual = CaixaVisualizacoes['movimentacao'];
export type CaixaImmersiveMonthlyPoint = CaixaImmersiveMonthlyVisual['meses'][number];
export type CaixaImmersiveCompositionVisual = CaixaVisualizacoes['composicao']['receitas'];
export type CaixaImmersiveCompositionItem = CaixaImmersiveCompositionVisual['itens'][number];
export type CaixaImmersiveBalanceVisual = CaixaVisualizacoes['saldosPorConta'];
export type CaixaImmersiveBalanceItem = CaixaImmersiveBalanceVisual['itens'][number];
