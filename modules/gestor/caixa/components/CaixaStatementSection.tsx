import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.types';
import { formatCaixaCompetencia, formatCaixaCurrency } from '../caixa.formatters';
import { CaixaAccountPositionList } from './immersive/CaixaAccountPositionList';
import { CaixaEditorialSection } from './immersive/CaixaEditorialSection';
import { CaixaExecutiveHero } from './immersive/CaixaExecutiveHero';
import { CaixaImmersiveBalanceDistribution } from './immersive/CaixaImmersiveBalanceDistribution';
import { CaixaImmersiveComboChart } from './immersive/CaixaImmersiveComboChart';
import { CaixaImmersiveDonutChart } from './immersive/CaixaImmersiveDonutChart';

interface CaixaStatementSectionProps {
  statement?: CaixaMonthlyStatement;
  isLoading: boolean;
  hasError: boolean;
  isConsolidated: boolean;
  onRetry: () => void;
}

const VisualUnavailable = () => (
  <div role="status" className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm text-amber-800">
    A leitura visual canônica não foi devolvida para este recorte.
  </div>
);

export const CaixaStatementSection: React.FC<CaixaStatementSectionProps> = ({
  statement, isLoading, hasError, isConsolidated, onRetry,
}) => {
  if (isLoading) {
    return (
      <section role="status" aria-busy="true" className="rounded-2xl border border-slate-200 bg-white py-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-500">Carregando prestação de contas do período e polo selecionados...</p>
      </section>
    );
  }

  if (hasError || !statement) {
    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
        <AlertTriangle className="mx-auto text-rose-500" size={30} />
        <h2 className="mt-3 text-base font-bold">Prestação mensal indisponível</h2>
        <p className="mt-1 text-sm">Não foi possível carregar os valores deste período e polo. Os demais resumos são apresentados separadamente.</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold">
          Tentar novamente
        </button>
      </section>
    );
  }

  const visual = statement.visualizacoes;

  return (
    <>
      {statement.classificacao.quantidadeSemPolo > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle size={17} className="shrink-0 text-amber-600" />
          <p className="text-sm">
            <strong>{formatCaixaCurrency(statement.classificacao.valorSemPolo)}</strong> em{' '}
            {statement.classificacao.quantidadeSemPolo}{' '}
            {statement.classificacao.quantidadeSemPolo === 1 ? 'movimento aguarda' : 'movimentos aguardam'} identificação do polo.
          </p>
        </div>
      )}

      <div id="caixa-visao" className="scroll-mt-28">
        <CaixaExecutiveHero
          competencia={formatCaixaCompetencia(statement.meta.competencia)}
          escopo={statement.meta.escopoRotulo}
          posicao={statement.saldosHoje.registradoTotal}
          bancarioRegistrado={statement.saldosHoje.bancarioRegistrado}
          caixaLocal={statement.saldosHoje.caixaLocal}
          entradas={statement.resumoCompetencia.entradasRecebidasBrutas}
          quantidadeRecebimentos={statement.resumoCompetencia.quantidadeRecebimentos}
          saidas={statement.resumoCompetencia.saidasPagas}
          quantidadePagamentos={statement.resumoCompetencia.quantidadePagamentos}
          tarifasBancariasConfirmadas={statement.resumoCompetencia.tarifasBancariasConfirmadas}
          resultado={statement.resumoCompetencia.resultado}
          resultadoStatus={statement.resumoCompetencia.resultadoStatus}
          posicaoLabel={isConsolidated ? 'Saldo contábil consolidado' : 'Posição atribuída ao polo'}
        />
      </div>

      <CaixaEditorialSection
        id="caixa-fluxo"
        eyebrow="Movimento e liquidez"
        title="O Caixa em movimento"
        description="Barras, linhas e distribuição usam escalas e segmentos preparados pelo banco para o escopo selecionado."
        tone="soft"
      >
        {visual ? (
          <div className="space-y-5">
            <CaixaImmersiveComboChart
              chartId="caixa-movimentacao-imersiva"
              title="Movimentação dos últimos seis meses"
              description="Entradas e saídas confirmadas, com resultado operacional e inadimplência no mesmo eixo temporal."
              accessibleSummary="Comparativo mensal de entradas, saídas, resultado operacional e inadimplência, com valores detalhados por mês."
              movimentacao={visual.movimentacao}
            />
            <CaixaImmersiveBalanceDistribution
              distributionId="caixa-distribuicao-saldos"
              title="Onde está o saldo positivo"
              description="Participação de cada conta ou caixa na posição positiva registrada."
              accessibleSummary="Distribuição percentual e monetária do saldo positivo entre as contas do escopo."
              totalLabel="Total positivo"
              distribution={visual.saldosPorConta}
            />
            <CaixaAccountPositionList accounts={statement.contas} />
          </div>
        ) : <VisualUnavailable />}
      </CaixaEditorialSection>

      <CaixaEditorialSection
        id="caixa-composicao"
        eyebrow="Composição operacional"
        title="De onde vem e para onde vai"
        description="Receitas e despesas continuam discriminadas por categoria, agora com leitura proporcional e valores exatos."
      >
        {visual ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <CaixaImmersiveDonutChart
              chartId="caixa-composicao-receitas"
              title="Receitas recebidas no mês"
              description="Composição por modalidade de curso."
              accessibleSummary="Distribuição das receitas recebidas por modalidade, com valor, percentual e quantidade."
              composition={visual.composicao.receitas}
              centerLabel="Receitas"
              emptyLabel="Nenhuma receita recebida no recorte."
            />
            <CaixaImmersiveDonutChart
              chartId="caixa-composicao-despesas"
              eyebrow="Destinos do caixa"
              title="Despesas pagas no mês"
              description="Tarifas bancárias aparecem somente quando confirmadas."
              accessibleSummary="Distribuição das despesas pagas por categoria, com valor, percentual e quantidade."
              composition={visual.composicao.despesas}
              centerLabel="Despesas"
              emptyLabel="Nenhuma despesa paga no recorte."
            />
          </div>
        ) : <VisualUnavailable />}
      </CaixaEditorialSection>
    </>
  );
};
