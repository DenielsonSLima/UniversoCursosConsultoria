import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Info,
  Landmark,
  ReceiptText,
  Scale,
  WalletCards,
} from 'lucide-react';
import {
  caixaDashboardQueryOptions,
  caixaCustosOperacionaisQueryOptions,
  caixaFinanciamentoResumoQueryOptions,
  caixaPatrimonioResumoQueryOptions,
  caixaPolosQueryOptions,
  getCurrentCaixaCompetencia,
  shiftCaixaCompetencia,
} from './caixa.service';
import { useCaixaRealtime } from './useCaixaRealtime';
import type { CaixaPolo } from './caixa-polos';
import {
  formatCaixaCompetencia,
  formatCaixaCurrency,
} from './caixa.formatters';
import {
  CaixaBreakdownList,
  CaixaMetricCard,
} from './components/CaixaDashboardCards';
import { CaixaReportLauncher } from './report/CaixaReportLauncher';
import { CaixaReconciliationCard } from './components/CaixaReconciliationCard';
import { CaixaFinanciamentoResumoCard } from './components/CaixaFinanciamentoResumoCard';
import { CaixaCustosOperacionaisCard } from './components/CaixaCustosOperacionaisCard';
import { CaixaPatrimonioResumoCard } from './components/CaixaPatrimonioResumoCard';

interface CaixaPageProps {
  poloId?: string | null;
  poloName?: string;
  isGlobal?: boolean;
  isMatriz?: boolean;
}

const formatPoloName = (polo?: CaixaPolo) => {
  if (!polo) return 'Polo atual';
  if (!polo.cidade) return polo.nome;
  return `${polo.cidade}/${(polo.estado || 'SE').toUpperCase()}`;
};

const CaixaPage: React.FC<CaixaPageProps> = ({
  poloId,
  poloName,
  isGlobal = false,
  isMatriz = false,
}) => {
  const currentCompetencia = getCurrentCaixaCompetencia();
  const canViewConsolidated = isGlobal && isMatriz;
  const [competencia, setCompetencia] = useState(currentCompetencia);
  const [selectedPolo, setSelectedPolo] = useState(
    poloId || (canViewConsolidated ? 'todos' : ''),
  );

  const { data: polos = [] } = useQuery({
    ...caixaPolosQueryOptions(),
    enabled: canViewConsolidated,
  });

  useEffect(() => {
    setSelectedPolo(poloId || (canViewConsolidated ? 'todos' : ''));
  }, [canViewConsolidated, poloId]);

  const visiblePolos = useMemo<CaixaPolo[]>(() => {
    if (canViewConsolidated) return polos as CaixaPolo[];
    if (!poloId) return [];
    return [{
      id: poloId,
      nome: poloName || 'Polo atual',
      cidade: null,
      estado: null,
      is_matriz: false,
      created_at: null,
    }];
  }, [canViewConsolidated, poloId, poloName, polos]);

  useCaixaRealtime();

  const { data: statement, isLoading, error } = useQuery({
    ...caixaDashboardQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: financiamentoResumo,
    isLoading: isFinanciamentoLoading,
    isError: hasFinanciamentoError,
  } = useQuery({
    ...caixaFinanciamentoResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: custosOperacionais,
    isLoading: isCustosOperacionaisLoading,
    isError: hasCustosOperacionaisError,
  } = useQuery({
    ...caixaCustosOperacionaisQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: patrimonioResumo,
    isLoading: isPatrimonioLoading,
    isError: hasPatrimonioError,
  } = useQuery({
    ...caixaPatrimonioResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const isCurrentCompetencia = competencia === currentCompetencia;
  const isConsolidated = selectedPolo === 'todos';
  const chartMonths = statement?.serieMensal.slice(-3) ?? [];
  const hasChartMovement = chartMonths.some(
    (month) => month.entradas !== 0 || month.saidas !== 0,
  );
  const chartResultMax = Math.max(
    1,
    ...chartMonths.map((month) => Math.abs(month.resultado)),
  );
  const getChartResultY = (result: number) => 50 - ((result / chartResultMax) * 35);
  const chartResultPoints = chartMonths
    .map((month, index) => {
      const x = ((index + 0.5) / chartMonths.length) * 100;
      return `${x},${getChartResultY(month.resultado)}`;
    })
    .join(' ');

  if (isLoading) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-500">Carregando prestação de contas...</p>
      </div>
    );
  }

  if (error || !statement) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
        <AlertTriangle className="mx-auto text-rose-500" size={30} />
        <h4 className="mt-3 text-base font-bold">Não foi possível carregar o Caixa</h4>
        <p className="mt-1 text-sm">Atualize a página ou tente novamente em alguns instantes.</p>
      </div>
    );
  }

  const resultTone = statement.resumoCompetencia.resultadoStatus === 'NEGATIVO'
    ? 'rose'
    : statement.resumoCompetencia.resultadoStatus === 'POSITIVO'
      ? 'green'
      : 'blue';

  return (
    <div className="mx-auto max-w-7xl animate-fadeIn space-y-5 pb-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#001a33]">Caixa</h1>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
              Prestação mensal
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Saúde financeira e posição contábil de {formatCaixaCompetencia(statement.meta.competencia)}.
          </p>
        </div>

        <div className="flex w-fit items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCompetencia((value) => shiftCaixaCompetencia(value, -1))}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="flex min-w-[154px] items-center justify-center gap-2 px-3 text-sm font-semibold text-slate-800">
              <CalendarDays size={15} className="text-blue-600" />
              {formatCaixaCompetencia(competencia)}
            </div>
            <button
              type="button"
              onClick={() => setCompetencia((value) => shiftCaixaCompetencia(value, 1))}
              disabled={isCurrentCompetencia}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Próximo mês"
            >
              <ChevronRight size={17} />
            </button>
          </div>
          <CaixaReportLauncher
            poloId={selectedPolo}
            competencia={competencia}
            scopeLabel={statement.meta.escopoRotulo}
          />
        </div>
      </header>

      <div className="overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-1">
          {canViewConsolidated && (
            <button
              type="button"
              onClick={() => setSelectedPolo('todos')}
              className={`relative flex items-center gap-2 px-3 pb-3 pt-2 text-sm font-semibold transition ${
                isConsolidated ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Scale size={15} />
              Resultado geral
              {isConsolidated && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-blue-600" />}
            </button>
          )}
          {visiblePolos.map((polo) => {
            const active = selectedPolo === polo.id;
            return (
              <button
                key={polo.id}
                type="button"
                onClick={() => setSelectedPolo(polo.id)}
                disabled={!canViewConsolidated}
                className={`relative flex items-center gap-2 px-3 pb-3 pt-2 text-sm font-semibold transition ${
                  active ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Landmark size={15} />
                {formatPoloName(polo)}
                {polo.is_matriz && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">
                    Matriz
                  </span>
                )}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-blue-600" />}
              </button>
            );
          })}
        </div>
      </div>

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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CaixaMetricCard
          label={isConsolidated ? 'Saldo contábil consolidado' : 'Posição atribuída ao polo'}
          value={statement.saldosHoje.registradoTotal}
          tone="navy"
          icon={<CircleDollarSign size={15} className="text-blue-400" />}
          helper={(
            <span>
              {isConsolidated ? 'Banco registrado' : 'Posição nas contas'}{' '}
              {formatCaixaCurrency(statement.saldosHoje.bancarioRegistrado)}
              {' · '}
              Caixa local {formatCaixaCurrency(statement.saldosHoje.caixaLocal)}
            </span>
          )}
        />
        <CaixaMetricCard
          label="Entradas operacionais no mês"
          value={statement.resumoCompetencia.entradasRecebidasBrutas}
          tone="green"
          icon={<ArrowUpRight size={15} className="text-emerald-500" />}
          helper={`${statement.resumoCompetencia.quantidadeRecebimentos} receita(s) operacional(is) confirmada(s)`}
        />
        <CaixaMetricCard
          label="Saídas operacionais no mês"
          value={statement.resumoCompetencia.saidasPagas}
          tone="rose"
          icon={<ArrowDownRight size={15} className="text-rose-500" />}
          helper={(
            <span>
              {statement.resumoCompetencia.quantidadePagamentos} pagamento(s)
              {statement.resumoCompetencia.tarifasBancariasConfirmadas > 0 && (
                <> · Tarifas {formatCaixaCurrency(statement.resumoCompetencia.tarifasBancariasConfirmadas)}</>
              )}
            </span>
          )}
        />
        <CaixaMetricCard
          label={
            statement.resumoCompetencia.resultadoStatus === 'NEGATIVO'
              ? 'Déficit operacional'
              : statement.resumoCompetencia.resultadoStatus === 'POSITIVO'
                ? 'Superávit operacional'
                : 'Resultado operacional'
          }
          value={statement.resumoCompetencia.resultado}
          tone={resultTone}
          icon={<Banknote size={15} />}
          helper="Entradas operacionais menos saídas operacionais do período"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-4 md:divide-y-0">
          {[
            { label: 'Receitas futuras', value: statement.compromissos.aReceber, color: 'text-emerald-700' },
            { label: 'Inadimplência', value: statement.compromissos.receberVencido, color: 'text-amber-600' },
            { label: 'Obrigações futuras', value: statement.compromissos.aPagar, color: 'text-rose-600' },
            { label: 'Obrigações vencidas', value: statement.compromissos.pagarVencido, color: 'text-rose-700' },
          ].map((item) => (
            <div key={item.label} className="px-4 py-3.5">
              <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
              <p className={`mt-1 text-lg font-bold ${item.color}`}>{formatCaixaCurrency(item.value)}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {item.label === 'Inadimplência' || item.label === 'Obrigações vencidas'
                  ? 'Valor vencido ainda não liquidado'
                  : 'Compromisso em aberto hoje'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <CaixaPatrimonioResumoCard
        resumo={patrimonioResumo}
        isLoading={isPatrimonioLoading}
        hasError={hasPatrimonioError}
      />

      <CaixaFinanciamentoResumoCard
        resumo={financiamentoResumo}
        isLoading={isFinanciamentoLoading}
        hasError={hasFinanciamentoError}
      />

      <CaixaCustosOperacionaisCard
        resumo={custosOperacionais}
        isLoading={isCustosOperacionaisLoading}
        hasError={hasCustosOperacionaisError}
      />

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Movimentação operacional</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Receitas, despesas e resultado dos últimos três meses
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] font-medium text-slate-500 sm:justify-end">
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Receitas
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Despesas
              </span>
              <span
                className="flex items-center gap-1.5"
                title="Resultado operacional: receitas menos despesas"
              >
                <i className="w-3 border-t-2 border-blue-500" /> Resultado operacional
              </span>
            </div>
          </div>

          {hasChartMovement ? (
            <div className="relative mt-5 flex min-h-[11rem] flex-1 items-end border-b border-slate-100 px-1 pb-2">
              <svg
                className="pointer-events-none absolute inset-x-1 top-0 z-10 h-[calc(100%-1.75rem)] w-[calc(100%-0.5rem)] overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line
                  x1="0"
                  y1="50"
                  x2="100"
                  y2="50"
                  stroke="#cbd5e1"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={chartResultPoints}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {chartMonths.map((month) => (
                <div
                  key={month.competencia}
                  className="group/month relative flex h-full min-w-0 flex-1 cursor-help flex-col justify-end border-l border-slate-100 px-1.5 outline-none transition-colors first:border-l-0 hover:bg-slate-50/60 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-2.5"
                  role="img"
                  tabIndex={0}
                  aria-label={`${month.rotulo}: entradas ${formatCaixaCurrency(month.entradas)}; saídas ${formatCaixaCurrency(month.saidas)}; resultado ${formatCaixaCurrency(month.resultado)}`}
                >
                  <span className="pointer-events-none absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-medium text-white shadow-lg group-hover/month:block group-focus/month:block">
                    Receitas {formatCaixaCurrency(month.entradas)} · Despesas{' '}
                    {formatCaixaCurrency(month.saidas)} · Resultado operacional{' '}
                    {formatCaixaCurrency(month.resultado)}
                  </span>
                  <div className="relative flex flex-1 items-end justify-center gap-1.5">
                    <span
                      className={`pointer-events-none absolute left-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ${
                        month.resultadoStatus === 'POSITIVO'
                          ? 'bg-emerald-500'
                          : month.resultadoStatus === 'NEGATIVO'
                            ? 'bg-rose-500'
                            : 'bg-blue-500'
                      }`}
                      style={{ top: `${getChartResultY(month.resultado)}%` }}
                      aria-hidden="true"
                    />
                    <div
                      className="group relative min-h-0 w-3 rounded-t bg-emerald-500 transition hover:bg-emerald-600 sm:w-5"
                      style={{ height: `${month.entradasEscalaPercentual}%` }}
                      aria-hidden="true"
                    >
                      <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[9px] text-white group-hover:block">
                        {formatCaixaCurrency(month.entradas)}
                      </span>
                    </div>
                    <div
                      className="group relative min-h-0 w-3 rounded-t bg-rose-500 transition hover:bg-rose-600 sm:w-5"
                      style={{ height: `${month.saidasEscalaPercentual}%` }}
                      aria-hidden="true"
                    >
                      <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[9px] text-white group-hover:block">
                        {formatCaixaCurrency(month.saidas)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 truncate text-center text-[10px] font-medium text-slate-500">
                    {month.rotulo}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex min-h-28 flex-1 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
              Nenhuma movimentação confirmada neste período.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Onde está o saldo</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Contas bancárias e caixas da unidade
              </p>
            </div>
            <Info size={16} className="mt-0.5 text-slate-400" />
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {statement.contas.length > 0 ? statement.contas.map((account) => (
              <div key={account.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                    {account.natureza === 'CAIXA_INTERNO'
                      ? <WalletCards size={17} />
                      : <Landmark size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {account.banco} · Ag. {account.agencia} · Conta {account.conta}
                        </p>
                        {!account.ativo && (
                          <p className="mt-0.5 text-[10px] font-semibold text-amber-600">
                            Inativa — somente histórico
                          </p>
                        )}
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {account.titular} · {account.cidadeUf}
                        </p>
                      </div>
                      <p className={`shrink-0 text-sm font-extrabold ${
                        account.valorExibido < 0 ? 'text-rose-600' : 'text-emerald-700'
                      }`}>
                        {formatCaixaCurrency(account.valorExibido)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
                      <span className="font-semibold text-blue-600">
                        {account.tipoValorExibido === 'POSICAO_POLO'
                          ? 'Posição deste polo'
                          : account.compartilhada
                            ? `Compartilhada com ${account.unidadesUso} unidades`
                            : 'Saldo registrado'}
                      </span>
                      {account.tipoValorExibido === 'POSICAO_POLO' && (
                        <span className="text-slate-400">
                          Total da conta {formatCaixaCurrency(account.saldoTotalRegistrado)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <p className="py-8 text-center text-sm text-slate-400">Nenhuma conta disponível.</p>
            )}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Saldo contábil atualizado por cobranças e baixas conciliadas.
              A integração Banese não consulta o extrato bancário.
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <ArrowUpRight size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Receitas recebidas no mês</h2>
              <p className="mt-0.5 text-xs text-slate-500">Por modalidade de curso</p>
            </div>
          </div>
          <CaixaBreakdownList
            items={statement.receitasPorModalidade}
            emptyLabel="Nenhuma receita recebida."
            tone="green"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
              <ArrowDownRight size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Despesas pagas no mês</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Tarifas bancárias aparecem somente quando confirmadas
              </p>
            </div>
          </div>
          <CaixaBreakdownList
            items={statement.despesasPorCategoria}
            emptyLabel="Nenhuma despesa paga."
            tone="rose"
          />
        </div>
      </section>

      <CaixaReconciliationCard reconciliation={statement.conciliacao} />

      <footer className="flex items-start gap-2 px-1 text-[10px] leading-4 text-slate-400">
        <ReceiptText size={13} className="mt-0.5 shrink-0" />
        <span>
          Esta tela apresenta posição contábil do sistema. Valores bancários reais devem ser conferidos
          com o extrato quando a integração de saldo estiver disponível.
        </span>
      </footer>
    </div>
  );
};

export default CaixaPage;
