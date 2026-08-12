import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import FinancialReportExportButton, {
  type FinancialReportColumn,
  type FinancialReportFilter,
  type FinancialReportRow,
  type FinancialReportSummaryCard,
} from '../../financeiro/components/FinancialReportPreview';
import {
  relatoriosService,
  type RelatorioFluxoCaixaFiltros,
} from '../relatorios.service';
import { relatoriosKeys } from '../relatorios.query-keys';
import {
  FilterField,
  FilterInput,
  formatCurrency,
  formatDate,
  SummaryCard,
} from './RelatorioShared';

interface RelatorioFluxoCaixaProps {
  company: any;
  polo: any;
}

const toInputDate = (date: Date) => [
  String(date.getFullYear()),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const initialPeriod = () => {
  const current = new Date();
  return {
    start: toInputDate(new Date(current.getFullYear(), current.getMonth(), 1)),
    end: toInputDate(new Date(current.getFullYear(), current.getMonth() + 1, 0)),
  };
};

const lineTypeLabel = (type: 'REALIZADO' | 'PROJECAO' | 'RESULTADO') => {
  if (type === 'PROJECAO') return 'Projeção';
  if (type === 'RESULTADO') return 'Resultado';
  return 'Realizado';
};

const lineTypeClass = (type: 'REALIZADO' | 'PROJECAO' | 'RESULTADO') => {
  if (type === 'PROJECAO') return 'bg-amber-50 text-amber-700';
  if (type === 'RESULTADO') return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-700';
};

const isOutflowLine = (chave: string) => (
  chave === 'SAIDAS_REALIZADAS' || chave === 'DESPESAS_EM_ABERTO'
);

const displayLineValue = (line: { chave: string; valor: number }) => (
  isOutflowLine(line.chave) ? -Math.abs(line.valor) : line.valor
);

const lineValueClass = (line: { chave: string; tipo: string; valor: number }) => {
  if (isOutflowLine(line.chave)) return 'text-rose-600';
  if (line.tipo === 'RESULTADO') return line.valor >= 0 ? 'text-emerald-700' : 'text-rose-600';
  return 'text-emerald-700';
};

const RelatorioFluxoCaixa: React.FC<RelatorioFluxoCaixaProps> = ({ company, polo }) => {
  const period = useMemo(initialPeriod, []);
  const [dataInicio, setDataInicio] = useState(period.start);
  const [dataFim, setDataFim] = useState(period.end);

  const filters = useMemo<RelatorioFluxoCaixaFiltros>(() => ({
    poloId: polo?.id || null,
    dataInicio,
    dataFim,
  }), [dataFim, dataInicio, polo?.id]);

  const reportQuery = useQuery({
    queryKey: relatoriosKeys.financeiro.fluxo(filters),
    queryFn: () => relatoriosService.getFluxoCaixa(filters),
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const data = reportQuery.data;
  const exportColumns = useMemo<FinancialReportColumn[]>(() => [
    { label: 'Indicador' },
    { label: 'Base', align: 'center' },
    { label: 'Valor', align: 'right' },
  ], []);
  const exportRows = useMemo<FinancialReportRow[]>(() => (data?.linhas || []).map((line) => ({
    id: line.chave,
    cells: [
      line.rotulo,
      lineTypeLabel(line.tipo),
      formatCurrency(displayLineValue(line)),
    ],
  })), [data?.linhas]);
  const exportSummary = useMemo<FinancialReportSummaryCard[]>(() => data ? [
    { label: 'Entradas realizadas', value: formatCurrency(data.resumo.entradasRealizadas), tone: 'emerald' },
    { label: 'Saídas realizadas', value: formatCurrency(data.resumo.saidasRealizadas), tone: 'rose' },
    { label: 'Fluxo realizado', value: formatCurrency(data.resumo.fluxoRealizado), tone: 'blue' },
    { label: 'Fluxo projetado', value: formatCurrency(data.resumo.fluxoProjetado), tone: 'amber' },
  ] : [], [data]);
  const exportFilters = useMemo<FinancialReportFilter[]>(() => data ? [
    { label: 'Período', value: formatDate(data.meta.dataInicio) + ' a ' + formatDate(data.meta.dataFim) },
    { label: 'Escopo', value: data.meta.escopo },
  ] : [], [data]);
  const canExport = Boolean(data && data.linhas.length > 0 && !reportQuery.isFetching);

  const clearPeriod = () => {
    const nextPeriod = initialPeriod();
    setDataInicio(nextPeriod.start);
    setDataFim(nextPeriod.end);
  };

  return (
    <div className="flex h-full w-full flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:w-80">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <WalletCards size={19} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Período do fluxo</h3>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-400">Realizado até hoje e projeção até o fim do período</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <FilterField label="Período">
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
          </div>

          <button
            type="button"
            onClick={clearPeriod}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Mês corrente completo
          </button>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <FinancialReportExportButton
            title="Fluxo de Caixa Realizado e Projetado"
            subtitle="Movimentos de caixa realizados até hoje e compromissos operacionais em aberto até o fim do período."
            rightTitle="Relatórios Financeiros"
            rightType="Fluxo de Caixa"
            fileName={['fluxo-de-caixa', dataInicio, dataFim].join('-')}
            columns={exportColumns}
            rows={exportRows}
            summaryCards={exportSummary}
            filters={exportFilters}
            footerNote="A projeção operacional soma receitas em aberto e subtrai despesas em aberto ao fluxo realizado. Não representa saldo bancário."
            poloId={polo?.id}
            polo={polo}
            company={company}
            tone="blue"
            buttonLabel="Gerar PDF"
            buttonClassName="w-full"
            disabled={!canExport}
          />
          {!canExport && !reportQuery.isLoading && (
            <p className="mt-2 text-center text-[10px] font-medium leading-relaxed text-slate-400">
              Não há dados consolidados para gerar o PDF neste período.
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
                <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Fluxo de Caixa Realizado e Projetado</h3>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
                  Confronta o caixa realizado até hoje com receitas e despesas operacionais em aberto até o fim do período selecionado.
                </p>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <CalendarDays size={13} />
                {formatDate(dataInicio)} a {formatDate(dataFim)}
              </div>
            </div>
          </header>

          {reportQuery.isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center" role="status" aria-label="Carregando fluxo de caixa">
              <RefreshCw size={28} className="animate-spin text-blue-600" />
            </div>
          ) : reportQuery.isError ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md rounded-3xl border border-rose-100 bg-rose-50 p-7 text-center">
                <AlertTriangle className="mx-auto text-rose-600" size={26} />
                <h4 className="mt-3 text-sm font-black uppercase tracking-tight text-rose-800">Não foi possível gerar o fluxo</h4>
                <p className="mt-2 text-xs font-medium leading-relaxed text-rose-700">{reportQuery.error instanceof Error ? reportQuery.error.message : 'Revise o período e tente novamente.'}</p>
                <button type="button" onClick={() => void reportQuery.refetch()} className="mt-5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700">Tentar novamente</button>
              </div>
            </div>
          ) : data ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryCard label="Entradas realizadas" value={formatCurrency(data.resumo.entradasRealizadas)} tone="emerald" />
                <SummaryCard label="Saídas realizadas" value={formatCurrency(data.resumo.saidasRealizadas)} tone="red" />
                <SummaryCard label="Receitas em aberto" value={formatCurrency(data.resumo.receitasEmAberto)} tone="blue" />
                <SummaryCard label="Despesas em aberto" value={formatCurrency(data.resumo.despesasEmAberto)} tone="amber" />
                <SummaryCard label="Fluxo realizado" value={formatCurrency(data.resumo.fluxoRealizado)} tone={data.resumo.fluxoRealizado >= 0 ? 'emerald' : 'red'} />
                <SummaryCard label="Fluxo projetado" value={formatCurrency(data.resumo.fluxoProjetado)} tone={data.resumo.fluxoProjetado >= 0 ? 'blue' : 'red'} />
              </div>

              {data.mensagem && (
                <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium leading-relaxed text-blue-800">
                  {data.mensagem}
                </p>
              )}

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Indicador</th>
                        <th className="px-4 py-3 text-center">Base</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {data.linhas.map((line) => (
                        <tr key={line.chave} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-bold text-[#001a33]">{line.rotulo}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={'inline-flex rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wide ' + lineTypeClass(line.tipo)}>
                              {lineTypeLabel(line.tipo)}
                            </span>
                          </td>
                          <td className={'px-4 py-3 text-right font-black ' + lineValueClass(line)}>
                            {line.tipo === 'RESULTADO'
                              ? line.valor >= 0
                                ? <TrendingUp className="mr-1 inline-block text-emerald-600" size={14} />
                                : <TrendingDown className="mr-1 inline-block text-rose-600" size={14} />
                              : null}
                            {formatCurrency(displayLineValue(line))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default RelatorioFluxoCaixa;
