import React, { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  RefreshCw,
  Search,
} from 'lucide-react';
import FinancialReportExportButton, {
  type FinancialReportColumn,
  type FinancialReportFilter,
  type FinancialReportRow,
  type FinancialReportSummaryCard,
  type FinancialReportTone,
} from '../../financeiro/components/FinancialReportPreview';
import {
  relatoriosService,
  type RelatorioMovimentacaoFinanceiraAgregacao,
  type RelatorioMovimentacaoFinanceiraFiltros,
} from '../relatorios.service';
import { relatoriosKeys } from '../relatorios.query-keys';
import {
  FilterField,
  FilterInput,
  formatCurrency,
  formatDate,
  SummaryCard,
} from './RelatorioShared';

type RelatorioResumoFinanceiroVisao = 'CATEGORIAS' | 'ENTRADAS';

interface RelatorioResumoFinanceiroProps {
  company: any;
  polo: any;
  visao: RelatorioResumoFinanceiroVisao;
}

interface SummaryConfiguration {
  title: string;
  shortTitle: string;
  description: string;
  tone: FinancialReportTone;
  aggregation: 'categorias' | 'classificacoes';
  fileName: string;
}

const SUMMARY_CONFIG: Record<RelatorioResumoFinanceiroVisao, SummaryConfiguration> = {
  CATEGORIAS: {
    title: 'Resumo Financeiro por Categoria',
    shortTitle: 'Resumo por Categoria',
    description: 'Receitas e despesas operacionais por competência, consolidadas por categoria com resultado líquido antes do limite da prévia.',
    tone: 'blue',
    aggregation: 'categorias',
    fileName: 'resumo-financeiro-por-categoria',
  },
  ENTRADAS: {
    title: 'Resumo das Entradas de Caixa',
    shortTitle: 'Composição das Entradas',
    description: 'Entradas efetivamente realizadas, agrupadas pela classificação financeira de cada movimento.',
    tone: 'emerald',
    aggregation: 'classificacoes',
    fileName: 'resumo-entradas-de-caixa',
  },
};

const toInputDate = (date: Date) => [
  String(date.getFullYear()),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const initialPeriod = () => {
  const current = new Date();
  return {
    start: toInputDate(new Date(current.getFullYear(), current.getMonth(), 1)),
    end: toInputDate(current),
  };
};

const toneIconClass = (tone: FinancialReportTone) => (
  tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-600'
    : 'bg-blue-50 text-blue-600'
);

const resultClass = (value: number) => {
  if (value < 0) return 'text-rose-600';
  return 'text-emerald-700';
};

const aggregationTotals = (items: RelatorioMovimentacaoFinanceiraAgregacao[]) => (
  items.reduce((current, item) => ({
    aberto: current.aberto + item.valorEmAberto,
    entradas: current.entradas + item.totalEntradas,
    saidas: current.saidas + item.totalSaidas,
    lancamentos: current.lancamentos + item.totalLancamentos,
  }), {
    aberto: 0,
    entradas: 0,
    saidas: 0,
    lancamentos: 0,
  })
);

const summaryCards = (
  visao: RelatorioResumoFinanceiroVisao,
  items: RelatorioMovimentacaoFinanceiraAgregacao[],
  totals: ReturnType<typeof aggregationTotals>,
): FinancialReportSummaryCard[] => {
  if (visao === 'ENTRADAS') {
    return [
      { label: 'Entradas realizadas', value: formatCurrency(totals.entradas), tone: 'emerald' },
      { label: 'Classificações', value: items.length, tone: 'slate' },
      { label: 'Lançamentos recebidos', value: totals.lancamentos, tone: 'amber' },
    ];
  }

  return [
    { label: 'Receitas', value: formatCurrency(totals.entradas), tone: 'emerald' },
    { label: 'Despesas', value: formatCurrency(totals.saidas), tone: 'rose' },
    { label: 'Resultado operacional', value: formatCurrency(totals.entradas - totals.saidas), tone: totals.entradas - totals.saidas >= 0 ? 'blue' : 'rose' },
    { label: 'Em aberto', value: formatCurrency(totals.aberto), tone: 'amber' },
  ];
};

const RelatorioResumoFinanceiro: React.FC<RelatorioResumoFinanceiroProps> = ({
  company,
  polo,
  visao,
}) => {
  const config = SUMMARY_CONFIG[visao];
  const period = useMemo(initialPeriod, []);
  const [dataInicio, setDataInicio] = useState(period.start);
  const [dataFim, setDataFim] = useState(period.end);
  const [busca, setBusca] = useState('');
  const deferredBusca = useDeferredValue(busca);

  const filters = useMemo<RelatorioMovimentacaoFinanceiraFiltros>(() => ({
    tipo: visao === 'CATEGORIAS' ? 'CATEGORIAS' : 'ENTRADAS',
    poloId: polo?.id || null,
    dataInicio,
    dataFim,
    contaBancariaId: null,
    categoria: null,
    status: 'ATIVOS',
    busca: deferredBusca || null,
  }), [dataFim, dataInicio, deferredBusca, polo?.id, visao]);

  const reportQuery = useQuery({
    queryKey: relatoriosKeys.financeiro.report({ ...filters, resumo: visao }),
    queryFn: () => relatoriosService.getMovimentacaoFinanceira(filters),
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const data = reportQuery.data;
  const groups = data?.agregacoes[config.aggregation] || [];
  const hasEntries = visao === 'ENTRADAS';
  const totals = useMemo(() => aggregationTotals(groups), [groups]);
  const exportColumns = useMemo<FinancialReportColumn[]>(() => (
    hasEntries
      ? [
        { label: 'Classificação' },
        { label: 'Lançamentos', align: 'right' },
        { label: 'Entradas realizadas', align: 'right' },
        { label: 'Participação', align: 'right' },
      ]
      : [
        { label: 'Categoria' },
        { label: 'Lançamentos', align: 'right' },
        { label: 'Receitas', align: 'right' },
        { label: 'Despesas', align: 'right' },
        { label: 'Resultado', align: 'right' },
        { label: 'Em aberto', align: 'right' },
      ]
  ), [hasEntries]);
  const exportRows = useMemo<FinancialReportRow[]>(() => groups.map((item) => ({
    id: item.chave,
    cells: hasEntries
      ? [
        item.rotulo,
        item.totalLancamentos,
        formatCurrency(item.totalEntradas),
        (totals.entradas > 0 ? (item.totalEntradas / totals.entradas) * 100 : 0).toFixed(1) + '%',
      ]
      : [
        item.rotulo,
        item.totalLancamentos,
        formatCurrency(item.totalEntradas),
        formatCurrency(item.totalSaidas),
        formatCurrency(item.totalEntradas - item.totalSaidas),
        formatCurrency(item.valorEmAberto),
      ],
  })), [groups, hasEntries, totals.entradas]);
  const exportSummary = useMemo(
    () => summaryCards(visao, groups, totals),
    [groups, totals, visao],
  );
  const exportFilters = useMemo<FinancialReportFilter[]>(() => data ? [
    { label: hasEntries ? 'Data das entradas' : 'Competência', value: formatDate(data.meta.dataInicio) + ' a ' + formatDate(data.meta.dataFim) },
    { label: 'Escopo', value: data.meta.escopo },
    ...(busca.trim() ? [{ label: 'Busca', value: busca.trim() }] : []),
  ] : [], [busca, data, hasEntries]);
  const canExport = Boolean(data && groups.length > 0 && !reportQuery.isFetching);

  const clearFilters = () => {
    const nextPeriod = initialPeriod();
    setDataInicio(nextPeriod.start);
    setDataFim(nextPeriod.end);
    setBusca('');
  };

  return (
    <div className="flex h-full w-full flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:w-80">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ' + toneIconClass(config.tone)}>
              {hasEntries ? <CircleDollarSign size={19} /> : <BarChart3 size={19} />}
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Filtros do relatório</h3>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-400">{config.shortTitle}</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <FilterField label={hasEntries ? 'Data das entradas' : 'Competência'}>
              <div className="grid grid-cols-2 gap-2">
                <FilterInput
                  type="date"
                  value={dataInicio}
                  max={dataFim}
                  onChange={(event) => setDataInicio(event.target.value)}
                  aria-label="Data inicial"
                />
                <FilterInput
                  type="date"
                  value={dataFim}
                  min={dataInicio}
                  onChange={(event) => setDataFim(event.target.value)}
                  aria-label="Data final"
                />
              </div>
            </FilterField>

            <FilterField label="Buscar">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <FilterInput
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder={hasEntries ? 'Descrição, pessoa ou conta' : 'Descrição, pessoa ou categoria'}
                  className="pl-9"
                />
              </div>
            </FilterField>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Limpar filtros
          </button>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <FinancialReportExportButton
            title={config.title}
            subtitle={config.description}
            rightTitle="Relatórios Financeiros"
            rightType={config.shortTitle}
            fileName={[config.fileName, dataInicio, dataFim].join('-')}
            columns={exportColumns}
            rows={exportRows}
            summaryCards={exportSummary}
            filters={exportFilters}
            footerNote={hasEntries
              ? 'As entradas realizadas são agregadas no contrato financeiro canônico antes do limite da prévia.'
              : 'Receitas e despesas permanecem separadas por categoria; o resultado é receita menos despesa antes do limite da prévia.'}
            poloId={polo?.id}
            polo={polo}
            company={company}
            tone={config.tone}
            buttonLabel="Gerar PDF"
            buttonClassName="w-full"
            disabled={!canExport}
          />
          {!canExport && !reportQuery.isLoading && (
            <p className="mt-2 text-center text-[10px] font-medium leading-relaxed text-slate-400">
              Aplique filtros que retornem ao menos um agrupamento para gerar o PDF.
            </p>
          )}
        </div>
      </aside>

      <section className="min-h-[70vh] min-w-0 flex-1 overflow-auto rounded-3xl bg-slate-100/70 p-4 custom-scrollbar sm:p-6">
        <div className="mx-auto min-h-full max-w-6xl rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <header className="border-b border-slate-100 pb-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  <CircleDollarSign size={13} />
                  Financeiro · {data?.meta.escopo || polo?.nome || 'Consolidado'}
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">{config.title}</h3>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">{config.description}</p>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <CalendarDays size={13} />
                {formatDate(dataInicio)} a {formatDate(dataFim)}
              </div>
            </div>
          </header>

          {reportQuery.isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center" role="status" aria-label="Carregando resumo financeiro">
              <RefreshCw size={28} className="animate-spin text-blue-600" />
            </div>
          ) : reportQuery.isError ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md rounded-3xl border border-rose-100 bg-rose-50 p-7 text-center">
                <AlertTriangle className="mx-auto text-rose-600" size={26} />
                <h4 className="mt-3 text-sm font-black uppercase tracking-tight text-rose-800">Não foi possível gerar o resumo</h4>
                <p className="mt-2 text-xs font-medium leading-relaxed text-rose-700">{reportQuery.error instanceof Error ? reportQuery.error.message : 'Revise os filtros e tente novamente.'}</p>
                <button type="button" onClick={() => void reportQuery.refetch()} className="mt-5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700">Tentar novamente</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {exportSummary.map((card) => (
                  <SummaryCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    tone={card.tone === 'rose' ? 'red' : card.tone}
                  />
                ))}
              </div>

              {data?.mensagem && (
                <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium leading-relaxed text-blue-800">
                  {data.mensagem}
                </p>
              )}

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">{hasEntries ? 'Classificação' : 'Categoria'}</th>
                        <th className="px-4 py-3 text-right">Lançamentos</th>
                        {hasEntries ? (
                          <>
                            <th className="px-4 py-3 text-right">Entradas</th>
                            <th className="px-4 py-3 text-right">Participação</th>
                          </>
                        ) : (
                          <>
                            <th className="px-4 py-3 text-right">Receitas</th>
                            <th className="px-4 py-3 text-right">Despesas</th>
                            <th className="px-4 py-3 text-right">Resultado</th>
                            <th className="px-4 py-3 text-right">Em aberto</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {groups.map((item) => (
                        <tr key={item.chave} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-bold text-[#001a33]">{item.rotulo}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-500">{item.totalLancamentos}</td>
                          {hasEntries ? (
                            <>
                              <td className="px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(item.totalEntradas)}</td>
                              <td className="px-4 py-3 text-right font-black text-slate-600">
                                {(totals.entradas > 0 ? (item.totalEntradas / totals.entradas) * 100 : 0).toFixed(1)}%
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(item.totalEntradas)}</td>
                              <td className="px-4 py-3 text-right font-black text-rose-600">{formatCurrency(item.totalSaidas)}</td>
                              <td className={'px-4 py-3 text-right font-black ' + resultClass(item.totalEntradas - item.totalSaidas)}>{formatCurrency(item.totalEntradas - item.totalSaidas)}</td>
                              <td className="px-4 py-3 text-right font-black text-amber-700">{formatCurrency(item.valorEmAberto)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      {groups.length === 0 && (
                        <tr>
                          <td colSpan={hasEntries ? 4 : 6} className="px-4 py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Nenhum agrupamento encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default RelatorioResumoFinanceiro;
