import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CaixaContasPagarResumo, CaixaMonthlyStatement } from '../caixa.types';
import { CaixaAdvancedAnalysis } from './CaixaAdvancedAnalysis';
import { CaixaCommitmentTracks } from './CaixaCommitmentTracks';
import { CaixaDistributionDonut, CaixaDistributionDonuts } from './CaixaDistributionDonuts';
import { CaixaFlowHero } from './CaixaFlowHero';
import { CaixaAccountsPanel, CaixaMovementAndAccounts } from './CaixaMovementAndAccounts';

const statement = {
  saldosHoje: {
    registradoTotal: 4321,
    bancarioRegistrado: 4000,
    caixaLocal: 321,
  },
  resumoCompetencia: {
    entradasRecebidasBrutas: 1000,
    tarifasBancariasConfirmadas: 0,
    saidasPagas: 350,
    resultado: 777,
    resultadoStatus: 'POSITIVO',
    quantidadeRecebimentos: 4,
    quantidadePagamentos: 2,
  },
  compromissos: {
    aReceber: 9999,
    receitasFuturas: {
      valorConfirmado: 2500,
      quantidadeElegiveis: 8,
      quantidadeEmConferencia: 3,
      valorNominalEmConferencia: 740,
      completo: false,
      criterio: 'OBRIGACOES_ABERTAS_COMPROVADAS_POSICAO_ATUAL',
    },
    receberVencido: 125,
    margemInadimplencia: 8.75,
    inadimplenciaMensal: {
      periodoInicio: '2026-10-01',
      periodoFimExclusivo: '2026-11-01',
      dataCorte: '2026-10-01',
      baseElegivel: 1428.57,
      quantidadeElegiveis: 11,
      quantidadeEmConferencia: 2,
      valorNominalEmConferencia: 410,
      completo: false,
      criterio: 'VENCIMENTO_MENSAL_POSICAO_NO_CORTE',
    },
    aPagar: 8888,
    pagarVencido: 7777,
  },
  receitasPorModalidade: [
    { codigo: 'EAD', rotulo: 'Cursos EAD', valor: 300, quantidade: 2, percentual: 12.5 },
    { codigo: 'LIVRES', rotulo: 'Cursos livres', valor: 200, quantidade: 1, percentual: 37.25 },
    { codigo: 'MICRO', rotulo: 'Receita residual', valor: 0.01, quantidade: 1, percentual: 0 },
  ],
  despesasPorCategoria: [
    { codigo: 'ADM', rotulo: 'Administrativas', valor: 80, quantidade: 1, percentual: 18.4 },
  ],
  serieMensal: [],
  contas: [
    {
      id: 'account-1',
      banco: 'BANESE',
      agencia: '033',
      conta: '100649-0',
      titular: 'UNIVERSO CURSOS',
      cidadeUf: 'Japoatã/SE',
      natureza: 'BANCARIA',
      compartilhada: true,
      unidadesUso: 3,
      valorExibido: 91.25,
      tipoValorExibido: 'POSICAO_POLO',
      saldoTotalRegistrado: 900,
      posicaoGerencialEscopo: 91.25,
      ativo: true,
      codigoInterno: 'BANESE',
    },
  ],
} as unknown as CaixaMonthlyStatement;

const payables: CaixaContasPagarResumo = {
  versao: 1,
  competencia: '2026-10-01',
  periodoInicio: '2026-10-01',
  periodoFimExclusivo: '2026-11-01',
  dataCorte: '2026-10-01',
  escopoTipo: 'POLO',
  poloId: 'polo-1',
  criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
  contasCompetencia: { valor: '9007199254740993.25', quantidade: 9 },
  pagasCompetencia: { valor: '800.40', quantidade: 4 },
  aVencerCompetencia: { valor: '123.45', quantidade: 3 },
  emAtraso: { valor: '76.10', quantidade: 2, dataMaisAntiga: '2026-09-28' },
  agendaFinanceira: {
    hoje: { valor: '20.00', quantidade: 1, data: '2026-10-01' },
    proximosSeteDias: {
      valor: '90.00',
      quantidade: 2,
      periodoInicio: '2026-10-02',
      periodoFimExclusivo: '2026-10-09',
    },
    dias: [],
  },
};

test('hero usa a equação canônica sem recalcular o resultado no frontend', () => {
  const html = renderToStaticMarkup(<CaixaFlowHero statement={statement} isConsolidated={false} />);

  assert.match(html, /Entradas recebidas/);
  assert.match(html, /Saídas pagas/);
  assert.match(html, /Superávit operacional/);
  assert.match(html, /1\.000,00/);
  assert.match(html, /350,00/);
  assert.match(html, /777,00/);
  assert.doesNotMatch(html, /650,00/);
  assert.match(html, /Posição atribuída ao polo/);
  assert.match(html, /4\.321,00/);
  assert.match(html, /Não compõe a equação do resultado mensal/);
});

test('hero preserva tarifas bancárias confirmadas sem recompor as saídas', () => {
  const statementWithFees = {
    ...statement,
    resumoCompetencia: {
      ...statement.resumoCompetencia,
      tarifasBancariasConfirmadas: 12.34,
    },
  } as CaixaMonthlyStatement;
  const html = renderToStaticMarkup(
    <CaixaFlowHero statement={statementWithFees} isConsolidated={false} />,
  );

  assert.match(html, /Tarifas R\$\s*12,34/);
  assert.match(html, /Saídas pagas/);
  assert.match(html, /350,00/);
});

test('trilhas mostram receber e pagar a partir de campos canônicos independentes', () => {
  const html = renderToStaticMarkup(
    <CaixaCommitmentTracks
      statement={statement}
      contasPagar={payables}
      isPayablesLoading={false}
      hasPayablesError={false}
    />,
  );

  assert.match(html, /Trilha a receber/);
  assert.match(html, /Recebido no mês/);
  assert.match(html, /2\.500,00/);
  assert.match(html, /Vencido no mês \(parcial\)/);
  assert.match(html, /8,75% da base/);
  assert.match(html, /Carteira futura parcial/);
  assert.match(html, /Trilha a pagar/);
  assert.match(html, /Total das contas da competência/i);
  assert.match(html, /9\.007\.199\.254\.740\.993,25/);
  assert.match(html, /9 conta\(s\) com vencimento/);
  assert.match(html, /800,40/);
  assert.match(html, /123,45/);
  assert.match(html, /76,10/);
  assert.match(html, /Próximos 7 dias/);
  assert.match(html, /Obrigações futuras \(posição atual\)/);
  assert.match(html, /8\.888,00/);
  assert.match(html, /Obrigações vencidas \(posição atual\)/);
  assert.match(html, /7\.777,00/);
  assert.match(html, /Base mensal elegível: R\$\s*1\.428,57 em 11 cobrança/);
});

test('trilha a pagar indisponível não inventa zero', () => {
  const html = renderToStaticMarkup(
    <CaixaCommitmentTracks
      statement={statement}
      isPayablesLoading={false}
      hasPayablesError
    />,
  );

  assert.match(html, /Compromissos a pagar indisponíveis/);
  assert.match(html, /Nenhum valor foi estimado/);
  assert.match(html, /8\.888,00/);
  assert.match(html, /7\.777,00/);
});

test('donut posiciona segmentos pelos percentuais canônicos e mantém o total informado', () => {
  const html = renderToStaticMarkup(
    <CaixaDistributionDonut
      title="Distribuição de teste"
      subtitle="Percentuais do servidor"
      totalLabel="Total canônico"
      totalValue={999}
      items={statement.receitasPorModalidade}
      emptyLabel="Sem dados"
      tone="green"
    />,
  );

  assert.match(html, /data-percentual="12\.5"/);
  assert.match(html, /stroke-dasharray="12\.5 100"/);
  assert.match(html, /data-percentual="37\.25"/);
  assert.match(html, /stroke-dashoffset="-12\.5"/);
  assert.match(html, /12,5%/);
  assert.match(html, /37,25%/);
  assert.match(html, /Receita residual/);
  assert.match(html, /0%/);
  assert.match(html, /999,00/);
  assert.doesNotMatch(html, /500,00/);
  assert.match(html, /role="img"/);
});

test('distribuições têm estado zero textual em vez de uma rosca enganosa', () => {
  const zeroStatement = {
    ...statement,
    receitasPorModalidade: [],
    despesasPorCategoria: [],
  } as CaixaMonthlyStatement;
  const html = renderToStaticMarkup(<CaixaDistributionDonuts statement={zeroStatement} />);

  assert.match(html, /Nenhuma receita recebida no período/);
  assert.match(html, /Nenhuma despesa paga no período/);
  assert.match(html, /percentuais canônicos confirmados/);
});

test('painel de contas preserva posição do polo e total da conta sem combiná-los', () => {
  const html = renderToStaticMarkup(<CaixaAccountsPanel accounts={statement.contas} />);

  assert.match(html, /Onde está o saldo/);
  assert.match(html, /Posição deste polo/);
  assert.match(html, /91,25/);
  assert.match(html, /Total da conta[^<]*R\$\s*900,00/);
  assert.match(html, /não consulta o extrato bancário/);
});

test('visão de movimento e contas mantém as duas leituras no mesmo bloco responsivo', () => {
  const html = renderToStaticMarkup(
    <CaixaMovementAndAccounts serieMensal={statement.serieMensal} accounts={statement.contas} />,
  );

  assert.match(html, /Evolução mensal e localização do saldo/);
  assert.match(html, /Movimentação operacional/);
  assert.match(html, /Nenhuma movimentação ou inadimplência confirmada/);
  assert.match(html, /Onde está o saldo/);
});

test('análises avançadas preservam todos os domínios em disclosures acessíveis', () => {
  const html = renderToStaticMarkup(
    <CaixaAdvancedAnalysis
      posicaoTotal={<div>posição total completa</div>}
      posicaoLiquida={<div>posição líquida completa</div>}
      patrimonio={<div>patrimônio completo</div>}
      convenios={<div>convênios completos</div>}
      financiamento={<div>financiamento completo</div>}
      linhaCorte={<div>linha de corte completa</div>}
      lineCutAttention
    />,
  );

  assert.equal((html.match(/<details/g) ?? []).length, 3);
  assert.match(html, /Posição e patrimônio/);
  assert.match(html, /Convênios e financiamento/);
  assert.match(html, /Linha de corte e ponto de equilíbrio/);
  assert.match(html, /Requer atenção/);
  assert.match(html, /posição total completa/);
  assert.match(html, /posição líquida completa/);
  assert.match(html, /patrimônio completo/);
  assert.match(html, /convênios completos/);
  assert.match(html, /financiamento completo/);
  assert.match(html, /linha de corte completa/);
});
