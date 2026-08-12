import React, { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  Phone,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import FinancialReportExportButton, {
  type FinancialReportColumn,
  type FinancialReportFilter,
  type FinancialReportRow,
  type FinancialReportSummaryCard,
} from '../../financeiro/components/FinancialReportPreview';
import {
  relatoriosService,
  type RelatorioInadimplenciaFiltros,
} from '../relatorios.service';
import { relatoriosKeys } from '../relatorios.query-keys';
import {
  FilterField,
  FilterInput,
  FilterSelect,
  formatCurrency,
  formatDate,
  SummaryCard,
} from './RelatorioShared';

interface RelatorioInadimplenciaProps {
  company: any;
  polo: any;
}

const toInputDate = (date: Date) => [
  String(date.getFullYear()),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const overdueOptions = [
  { value: 1, label: 'Qualquer atraso (a partir de 1 dia)' },
  { value: 8, label: 'A partir de 8 dias' },
  { value: 31, label: 'A partir de 31 dias' },
  { value: 61, label: 'A partir de 61 dias' },
  { value: 91, label: 'A partir de 91 dias' },
];

const overdueTone = (days: number) => {
  if (days >= 61) return 'bg-rose-50 text-rose-700';
  if (days >= 31) return 'bg-orange-50 text-orange-700';
  return 'bg-amber-50 text-amber-700';
};

const RelatorioInadimplencia: React.FC<RelatorioInadimplenciaProps> = ({ company, polo }) => {
  const [dataCorte, setDataCorte] = useState(() => toInputDate(new Date()));
  const [minDiasAtraso, setMinDiasAtraso] = useState(1);
  const [busca, setBusca] = useState('');
  const deferredBusca = useDeferredValue(busca);

  const filters = useMemo<RelatorioInadimplenciaFiltros>(() => ({
    poloId: polo?.id || null,
    dataCorte,
    minDiasAtraso,
    busca: deferredBusca || null,
  }), [dataCorte, deferredBusca, minDiasAtraso, polo?.id]);

  const reportQuery = useQuery({
    queryKey: relatoriosKeys.financeiro.inadimplencia(filters),
    queryFn: () => relatoriosService.getInadimplencia(filters),
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const data = reportQuery.data;
  const percentualInadimplencia = data?.resumo.percentualComparavel
    && data.resumo.percentualInadimplencia !== null
    ? data.resumo.percentualInadimplencia.toFixed(1) + '%'
    : '—';
  const exportColumns = useMemo<FinancialReportColumn[]>(() => [
    { label: 'Devedor' },
    { label: 'Contato' },
    { label: 'Curso / lançamento' },
    { label: 'Vencimento', align: 'center' },
    { label: 'Atraso', align: 'center' },
    { label: 'Saldo em aberto', align: 'right' },
  ], []);
  const exportRows = useMemo<FinancialReportRow[]>(() => (data?.devedores || []).map((item) => ({
    id: item.id,
    cells: [
      item.devedor,
      item.contato || 'Não informado',
      item.curso || item.descricao,
      formatDate(item.dataVencimento),
      String(item.diasAtraso) + ' dias',
      formatCurrency(item.valorEmAberto),
    ],
  })), [data?.devedores]);
  const exportSummary = useMemo<FinancialReportSummaryCard[]>(() => data ? [
    { label: 'Títulos vencidos', value: data.resumo.quantidadeTitulos, tone: 'amber' },
    { label: 'Devedores', value: data.resumo.quantidadeDevedores, tone: 'slate' },
    { label: 'Saldo em atraso', value: formatCurrency(data.resumo.valorEmAtraso), tone: 'rose' },
    { label: 'Inadimplência', value: percentualInadimplencia, tone: 'blue' },
  ] : [], [data, percentualInadimplencia]);
  const exportFilters = useMemo<FinancialReportFilter[]>(() => data ? [
    { label: 'Data de corte', value: formatDate(data.meta.dataCorte) },
    { label: 'Escopo', value: data.meta.escopo },
    { label: 'Atraso mínimo', value: String(data.meta.minDiasAtraso) + ' dia(s)' },
    ...(busca.trim() ? [{ label: 'Busca', value: busca.trim() }] : []),
  ] : [], [busca, data]);
  const canExport = Boolean(
    data
    && data.completo
    && data.devedores.length > 0
    && !reportQuery.isFetching,
  );

  const clearFilters = () => {
    setDataCorte(toInputDate(new Date()));
    setMinDiasAtraso(1);
    setBusca('');
  };

  return (
    <div className="flex h-full w-full flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:w-80">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertTriangle size={19} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Filtros da cobrança</h3>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-400">Aging de contas a receber vencidas</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <FilterField label="Data de corte">
              <FilterInput
                type="date"
                value={dataCorte}
                max={toInputDate(new Date())}
                onChange={(event) => setDataCorte(event.target.value)}
                aria-label="Data de corte"
              />
            </FilterField>

            <FilterField label="Atraso mínimo">
              <FilterSelect
                value={minDiasAtraso}
                onChange={(event) => setMinDiasAtraso(Number(event.target.value))}
              >
                {overdueOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="Buscar">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <FilterInput
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Devedor, contato ou curso"
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
            title="Relatório de Inadimplência"
            subtitle="Contas a receber vencidas, com saldo residual, faixas de atraso e dados operacionais de cobrança."
            rightTitle="Relatórios Financeiros"
            rightType="Inadimplência"
            fileName={['relatorio-inadimplencia', dataCorte].join('-')}
            columns={exportColumns}
            rows={exportRows}
            summaryCards={exportSummary}
            filters={exportFilters}
            footerNote="Dados pessoais exibidos exclusivamente para operação de cobrança autorizada. O saldo considera pagamentos parciais e a taxa só é exibida na visão completa do corte."
            poloId={polo?.id}
            polo={polo}
            company={company}
            tone="rose"
            buttonLabel="Gerar PDF"
            buttonClassName="w-full"
            disabled={!canExport}
          />
          {!canExport && !reportQuery.isLoading && (
            <p className="mt-2 text-center text-[10px] font-medium leading-relaxed text-slate-400">
              {data && !data.completo
                ? 'Reduza os filtros para gerar um PDF completo com dados pessoais.'
                : 'Aplique filtros que retornem ao menos um título em atraso para gerar o PDF.'}
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
                  Cobrança · {data?.meta.escopo || polo?.nome || 'Consolidado'}
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Relatório de Inadimplência</h3>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
                  Títulos vencidos por data de corte, com saldo residual e faixas de atraso para priorizar a cobrança.
                </p>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <CalendarDays size={13} />
                Corte em {formatDate(dataCorte)}
              </div>
            </div>
          </header>

          {reportQuery.isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center" role="status" aria-label="Carregando inadimplência">
              <RefreshCw size={28} className="animate-spin text-rose-600" />
            </div>
          ) : reportQuery.isError ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md rounded-3xl border border-rose-100 bg-rose-50 p-7 text-center">
                <AlertTriangle className="mx-auto text-rose-600" size={26} />
                <h4 className="mt-3 text-sm font-black uppercase tracking-tight text-rose-800">Não foi possível gerar a inadimplência</h4>
                <p className="mt-2 text-xs font-medium leading-relaxed text-rose-700">{reportQuery.error instanceof Error ? reportQuery.error.message : 'Revise os filtros e tente novamente.'}</p>
                <button type="button" onClick={() => void reportQuery.refetch()} className="mt-5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700">Tentar novamente</button>
              </div>
            </div>
          ) : data ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Títulos vencidos" value={data.resumo.quantidadeTitulos} tone="amber" />
                <SummaryCard label="Devedores" value={data.resumo.quantidadeDevedores} tone="slate" />
                <SummaryCard label="Saldo em atraso" value={formatCurrency(data.resumo.valorEmAtraso)} tone="red" />
                <SummaryCard label="Inadimplência" value={percentualInadimplencia} tone="blue" />
              </div>

              <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-medium leading-relaxed text-slate-600">
                {data.resumo.percentualComparavel
                  ? 'Base da taxa: ' + formatCurrency(data.resumo.valorEmAtraso) + ' em atraso sobre ' + formatCurrency(data.resumo.valorFaturadoVencido) + ' faturados e vencidos no escopo do corte.'
                  : 'A taxa de inadimplência fica oculta quando a busca ou o atraso mínimo restringe a amostra. O saldo e as faixas continuam refletindo os filtros aplicados.'}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {data.faixas.map((faixa) => (
                  <div key={faixa.chave} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{faixa.rotulo}</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">{formatCurrency(faixa.valorEmAberto)}</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">{faixa.quantidade} título(s)</p>
                  </div>
                ))}
              </div>

              {data.mensagem && (
                <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-800">
                  {data.mensagem}
                </p>
              )}

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Devedor</th>
                        <th className="px-4 py-3">Contato</th>
                        <th className="px-4 py-3">Curso / lançamento</th>
                        <th className="px-4 py-3 text-center">Vencimento</th>
                        <th className="px-4 py-3 text-center">Atraso</th>
                        <th className="px-4 py-3 text-right">Saldo em aberto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {data.devedores.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-bold text-[#001a33]">{item.devedor}</td>
                          <td className="px-4 py-3 font-semibold text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Phone size={12} className="text-slate-400" />
                              {item.contato || 'Não informado'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-700">{item.curso || item.descricao || 'Não informado'}</p>
                            {item.curso && item.descricao && item.descricao !== item.curso ? (
                              <p className="mt-0.5 text-[10px] font-medium text-slate-400">{item.descricao}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-500">{formatDate(item.dataVencimento)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={'inline-flex rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wide ' + overdueTone(item.diasAtraso)}>
                              {item.diasAtraso} dias
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-rose-600">{formatCurrency(item.valorEmAberto)}</td>
                        </tr>
                      ))}
                      {data.devedores.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Nenhum título em atraso atende aos filtros selecionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-medium leading-relaxed text-slate-500">
                <Users size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  A lista operacional contém dados pessoais e só fica disponível dentro do módulo autorizado de Relatórios.
                </span>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default RelatorioInadimplencia;
