import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CaixaConveniosResumo } from '../caixa-convenios.service';
import type {
  CaixaFinanciamentoResumo,
  CaixaPatrimonioResumo,
  CaixaPosicaoLiquidaResumo,
  CaixaPosicaoTotalResumo,
} from '../caixa.types';
import { CaixaLinkedCapitalOverview } from './CaixaLinkedCapitalOverview';
import { CaixaStructuralOverview } from './CaixaStructuralOverview';

const posicaoTotal: CaixaPosicaoTotalResumo = {
  versao: 1,
  competencia: '2026-10-01',
  dataCorte: '2026-10-02',
  escopoTipo: 'POLO',
  poloId: 'polo-1',
  disponivel: true,
  dados: {
    saldoCaixaRegistrado: '100.00',
    valorPatrimonialCusto: '200.00',
    saldoEmprestimosAPagar: '50.00',
    valorTotalLiquido: '777.77',
    observacao: 'Total fechado exclusivamente pelo servidor.',
  },
};

const posicaoLiquida: CaixaPosicaoLiquidaResumo = {
  versao: 1,
  competencia: '2026-10-01',
  escopoTipo: 'POLO',
  poloId: 'polo-1',
  valorPatrimonialCusto: '400.00',
  saldoEmprestimosAPagar: '100.00',
  valorLiquido: '999.99',
  observacao: 'Leitura líquida canônica divergente de uma conta local.',
};

const patrimonio: CaixaPatrimonioResumo = {
  versao: 1,
  competencia: '2026-10-01',
  escopoTipo: 'POLO',
  poloId: 'polo-1',
  posicaoFechamento: { registrosAtivos: 3, unidadesAtivas: 12, valorAtivoCusto: '444.44' },
  aquisicoesCompetencia: { registros: 2, unidades: 6, valorCusto: '55.55' },
  perdasCompetencia: { movimentos: 1, unidades: 2, valorCusto: '11.11' },
  observacao: 'Patrimônio a custo não altera o resultado operacional.',
};

const convenios: CaixaConveniosResumo = {
  versao: 1,
  competencia: '2026-10-01',
  escopoTipo: 'POLO',
  poloId: 'polo-1',
  quantidadeConvenios: 1,
  saldoInicial: 10,
  creditosRecebidos: 20,
  despesasPagas: 3,
  comprometidoAberto: 4,
  saldoDisponivel: 888.88,
  saldoProjetado: 999.99,
  itens: [{
    convenioId: 'convenio-1',
    nome: 'Convênio Escola Viva',
    competencia: '2026-10-01',
    status: 'ABERTO',
    saldoInicial: 10,
    creditosRecebidos: 20,
    despesasPagas: 3,
    comprometidoAberto: 4,
    saldoDisponivel: 888.88,
    saldoProjetado: 999.99,
  }],
};

const financiamento: CaixaFinanciamentoResumo = {
  competencia: '2026-10-01',
  creditoLiberadoMatriz: 1000,
  obrigacaoRateada: 700,
  principalRateado: 510,
  encargosRateados: 77,
  pagoRateado: 222,
  observacao: 'Crédito não é receita operacional.',
};

test('mapa estrutural exibe resultados canônicos sem refazer as equações', () => {
  const html = renderToStaticMarkup(
    <CaixaStructuralOverview
      posicaoTotal={posicaoTotal}
      posicaoLiquida={posicaoLiquida}
      patrimonio={patrimonio}
      isPosicaoTotalLoading={false}
      hasPosicaoTotalError={false}
      isPosicaoLiquidaLoading={false}
      hasPosicaoLiquidaError={false}
      isPatrimonioLoading={false}
      hasPatrimonioError={false}
    />,
  );

  assert.match(html, /Como a posição registrada é formada/);
  assert.match(html, /R\$\s*777,77/);
  assert.match(html, /R\$\s*999,99/);
  assert.doesNotMatch(html, /R\$\s*250,00/);
  assert.doesNotMatch(html, /R\$\s*300,00/);
  assert.match(html, /Calculado no backend/);
  assert.match(html, /Ativo a custo/);
  assert.match(html, /Aquisições/);
  assert.match(html, /Perdas/);
  assert.match(html, /Total fechado exclusivamente pelo servidor/);
});

test('falha em patrimônio não derruba a posição total nem transforma ausência em zero', () => {
  const html = renderToStaticMarkup(
    <CaixaStructuralOverview
      posicaoTotal={posicaoTotal}
      posicaoLiquida={posicaoLiquida}
      isPosicaoTotalLoading={false}
      hasPosicaoTotalError={false}
      isPosicaoLiquidaLoading={false}
      hasPosicaoLiquidaError={false}
      isPatrimonioLoading={false}
      hasPatrimonioError
    />,
  );

  assert.match(html, /R\$\s*777,77/);
  assert.match(html, /Inventário indisponível/);
  assert.match(html, /R\$\s*999,99/);
});

test('capital vinculado usa disponível, projetado e rateios devolvidos pelo backend', () => {
  const html = renderToStaticMarkup(
    <CaixaLinkedCapitalOverview
      convenios={convenios}
      financiamento={financiamento}
      isConveniosLoading={false}
      hasConveniosError={false}
      isFinanciamentoLoading={false}
      hasFinanciamentoError={false}
    />,
  );

  assert.match(html, /Origem, compromisso e destino dos recursos/);
  assert.match(html, /R\$\s*888,88/);
  assert.match(html, /R\$\s*999,99/);
  assert.doesNotMatch(html, /R\$\s*27,00/);
  assert.doesNotMatch(html, /R\$\s*23,00/);
  assert.match(html, /Convênio Escola Viva/);
  assert.match(html, /Crédito liberado neste escopo/);
  assert.match(html, /R\$\s*1\.000,00/);
  assert.match(html, /R\$\s*700,00/);
  assert.match(html, /R\$\s*510,00/);
  assert.match(html, /R\$\s*77,00/);
  assert.match(html, /R\$\s*222,00/);
  assert.match(html, /Fora da receita operacional/);
});

test('erro isolado de convênio preserva o financiamento canônico', () => {
  const html = renderToStaticMarkup(
    <CaixaLinkedCapitalOverview
      financiamento={financiamento}
      isConveniosLoading={false}
      hasConveniosError
      isFinanciamentoLoading={false}
      hasFinanciamentoError={false}
    />,
  );

  assert.match(html, /Convênios indisponíveis/);
  assert.match(html, /R\$\s*1\.000,00/);
  assert.doesNotMatch(html, /Convênios indisponíveis[\s\S]*Financiamento indisponível/);
});
