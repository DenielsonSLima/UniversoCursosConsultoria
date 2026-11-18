import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  Landmark,
  RefreshCw,
  Search,
  WalletCards,
} from 'lucide-react';
import FinancialReportExportButton, {
  FinancialReportStatusBadge,
  type FinancialReportRow,
} from '../../financeiro/components/FinancialReportPreview';
import {
  relatoriosService,
  type RelatorioMovimentacaoFinanceiraData,
  type RelatorioMovimentacaoFinanceiraFiltros,
  type RelatorioMovimentacaoFinanceiraStatus,
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

import { REPORT_CONFIG, getExportColumns, initialPeriod, statusOptions, statusTone, directionText, directionClass, reportFilters, reportSummary, type RelatorioMovimentacaoFinanceiraProps } from './movimentacao-financeira.presentation';
import ExtratoContaScope from './ExtratoContaScope';
import { resolveExtratoPoloId, extratoScopeLabel } from '../extrato-conta-scope';
import { getExtratoFinanceiroPdf } from '../extrato-financeiro-pdf.service';

const RelatorioMovimentacaoFinanceira: React.FC<RelatorioMovimentacaoFinanceiraProps> = ({
  company,
  isGlobal = false,
  polo,
  tipo,
}) => {
  const [wholeAccount, setWholeAccount] = useState(false);
  const effectivePoloId = resolveExtratoPoloId(tipo, isGlobal, wholeAccount, polo?.id);
  const config = REPORT_CONFIG[tipo];
  const period = useMemo(initialPeriod, []);
  const [dataInicio, setDataInicio] = useState(period.start);
  const [dataFim, setDataFim] = useState(period.end);
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [status, setStatus] = useState<RelatorioMovimentacaoFinanceiraStatus>('ATIVOS');
  const [busca, setBusca] = useState('');
  const deferredBusca = useDeferredValue(busca);

  const filters = useMemo<RelatorioMovimentacaoFinanceiraFiltros>(() => ({
    tipo,
    poloId: effectivePoloId,
    dataInicio,
    dataFim,
    contaBancariaId: config.allowsAccountFilter ? contaBancariaId || null : null,
    categoria: categoria || null,
    status: config.showsStatus ? status : 'ATIVOS',
    busca: deferredBusca || null,
  }), [categoria, config.allowsAccountFilter, config.showsStatus, contaBancariaId, dataFim, dataInicio, deferredBusca, effectivePoloId, status, tipo]);

  const reportQuery = useQuery({
    queryKey: relatoriosKeys.financeiro.report(filters),
    queryFn: () => relatoriosService.getMovimentacaoFinanceira(filters),
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const data = reportQuery.data;
  const [pdfData, setPdfData] = useState<RelatorioMovimentacaoFinanceiraData | null>(null);
  const [pdfError, setPdfError] = useState('');
  const filterKey = JSON.stringify(filters);
  const latestFilterKey = useRef(filterKey);
  latestFilterKey.current = filterKey;
  useEffect(() => { setPdfData(null); setPdfError(''); }, [filterKey]);
  const exportData = tipo === 'EXTRATO_CONTA' ? pdfData : data;
  const prepareExport = async () => {
    if (tipo !== 'EXTRATO_CONTA') return;
    setPdfError('');
    try {
      const snapshot = await getExtratoFinanceiroPdf(filters);
      if (filterKey !== latestFilterKey.current) {
        throw new Error('Os filtros mudaram. Gere o PDF novamente com o período desejado.');
      }
      setPdfData(snapshot);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'Não foi possível preparar o extrato.');
      throw error;
    }
  };
  const accounts = data?.contas || [];
  const categories = data?.categorias || [];
  const requiresAccountSelection = config.requiresAccount && !contaBancariaId;
  const scopeCaption = extratoScopeLabel(effectivePoloId);
  const hasStatementRowFilter = tipo === 'EXTRATO_CONTA' && Boolean(categoria || busca.trim());

  useEffect(() => {
    if (!data || reportQuery.isFetching || !contaBancariaId || accounts.some((account) => account.id === contaBancariaId)) return;
    setContaBancariaId('');
  }, [accounts, contaBancariaId, data, reportQuery.isFetching]);

  const clearFilters = () => {
    const nextPeriod = initialPeriod();
    setDataInicio(nextPeriod.start);
    setDataFim(nextPeriod.end);
    setCategoria('');
    setStatus('ATIVOS');
    setBusca('');
    if (!config.requiresAccount) setContaBancariaId('');
  };

  const exportColumns = useMemo(() => getExportColumns(tipo, config), [tipo, config]);

  const exportRows = useMemo<FinancialReportRow[]>(() => (exportData?.movimentos || []).map((item) => {
    const description = (
      <div>
        <p className="font-bold text-slate-800">{item.descricao}</p>
        {tipo === 'EXTRATO_CONTA' && <p>{item.classificacao === 'TRANSFERENCIA' ? 'Polo relacionado' : 'Polo'}: {item.polo || 'Não identificado'}</p>}
        <p className="mt-0.5 text-[8px] font-medium text-slate-500">{item.contraparte}</p>
      </div>
    );

    if (tipo === 'EXTRATO_CONTA') {
      return {
        id: item.id,
        cells: [
          formatDate(item.data),
          <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${directionClass(item)}`}>{directionText(item)}</span>,
          description,
          item.categoria,
          item.direcao === 'ENTRADA' ? formatCurrency(item.valor) : '—',
          item.direcao === 'SAIDA' ? formatCurrency(item.valor) : '—',
          item.saldoApos === null ? '—' : formatCurrency(item.saldoApos),
        ],
      };
    }

    if (config.flow) {
      return {
        id: item.id,
        cells: [
          formatDate(item.data),
          <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${directionClass(item)}`}>{item.classificacao}</span>,
          description,
          item.conta,
          item.categoria,
          formatCurrency(item.valor),
        ],
      };
    }

    return {
      id: item.id,
      cells: [
        formatDate(item.data),
        <FinancialReportStatusBadge status={item.status} />,
        description,
        item.categoria,
        formatCurrency(item.valorPrevisto),
        item.valorRealizado > 0 ? formatCurrency(item.valorRealizado) : '—',
      ],
    };
  }), [config.flow, exportData?.movimentos, tipo]);

  const exportSummary = useMemo(
    () => exportData ? reportSummary(exportData, config, hasStatementRowFilter) : [],
    [config, exportData, hasStatementRowFilter],
  );
  const exportFilters = useMemo(
    () => exportData ? reportFilters(exportData, config, {
      categoria,
      status,
      busca: busca.trim(),
    }) : [],
    [busca, categoria, config, exportData, status],
  );
  const canExport = Boolean(
    data
    && data.completo
    && !requiresAccountSelection
    && data.movimentos.length > 0
    && !reportQuery.isFetching,
  );

  return (
    <div className="flex h-full w-full flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:w-80">
        <div className="space-y-5">
          <div>
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${config.tone === 'rose' ? 'bg-rose-50 text-rose-600' : config.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                {tipo === 'EXTRATO_CONTA' ? <Landmark size={19} /> : <CircleDollarSign size={19} />}
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Filtros do relatório</h3>
                <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-400">{config.shortTitle}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <FilterField label={config.dateLabel}>
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

            {config.allowsAccountFilter && (
              <FilterField label={config.requiresAccount ? 'Conta para extrato' : 'Filtrar por conta'}>
                <FilterSelect
                  value={contaBancariaId}
                  onChange={(event) => setContaBancariaId(event.target.value)}
                  aria-required={config.requiresAccount}
                >
                  <option value="">{config.requiresAccount ? 'Selecione uma conta' : 'Todas as contas'}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.rotulo}{!account.ativa ? ' · inativa' : account.compartilhada ? ' · compartilhada' : ''}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
            )}

            <ExtratoContaScope enabled={tipo === 'EXTRATO_CONTA' && isGlobal && Boolean(polo?.id)} value={wholeAccount} onChange={setWholeAccount} />
            <FilterField label="Categoria">
              <FilterSelect value={categoria} onChange={(event) => setCategoria(event.target.value)}>
                <option value="">Todas as categorias</option>
                {categories.map((category) => (
                  <option key={category.chave} value={category.chave}>{category.rotulo}</option>
                ))}
              </FilterSelect>
            </FilterField>

            {config.showsStatus && (
              <FilterField label="Situação">
                <FilterSelect value={status} onChange={(event) => setStatus(event.target.value as RelatorioMovimentacaoFinanceiraStatus)}>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </FilterSelect>
              </FilterField>
            )}

            <FilterField label="Buscar">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <FilterInput
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Descrição, pessoa ou conta"
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
            subtitle={tipo === 'EXTRATO_CONTA' ? `${config.description} ${scopeCaption}.` : config.description}
            rightTitle="Relatórios Financeiros"
            rightType={config.shortTitle}
            fileName={`${config.fileName}-${dataInicio}-${dataFim}`}
            columns={exportColumns}
            rows={exportRows}
            summaryCards={exportSummary}
            filters={exportFilters}
            footerNote="Valores e saldos são calculados pelo contrato financeiro canônico."
            poloId={effectivePoloId}
            polo={effectivePoloId ? polo : null}
            company={company}
            tone={config.tone}
            buttonLabel="Gerar PDF"
            buttonClassName="w-full"
            disabled={!canExport}
            onBeforeOpen={prepareExport}
          />
          {pdfError && <p role="alert" className="mt-2 text-xs text-red-700">{pdfError}</p>}
          {!canExport && !reportQuery.isLoading && (
            <p className="mt-2 text-center text-[10px] font-medium leading-relaxed text-slate-400">
              {requiresAccountSelection
                ? 'Selecione uma conta para gerar o extrato.'
                : data && !data.completo
                  ? 'Reduza o período ou aplique filtros para gerar um PDF completo.'
                  : 'Aplique filtros que retornem ao menos um lançamento para gerar o PDF.'}
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
                  <WalletCards size={13} />
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
            <div className="flex min-h-[420px] items-center justify-center" role="status" aria-label="Carregando relatório financeiro">
              <RefreshCw size={28} className="animate-spin text-blue-600" />
            </div>
          ) : reportQuery.isError ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md rounded-3xl border border-rose-100 bg-rose-50 p-7 text-center">
                <AlertTriangle className="mx-auto text-rose-600" size={26} />
                <h4 className="mt-3 text-sm font-black uppercase tracking-tight text-rose-800">Não foi possível gerar o relatório</h4>
                <p className="mt-2 text-xs font-medium leading-relaxed text-rose-700">{reportQuery.error instanceof Error ? reportQuery.error.message : 'Revise os filtros e tente novamente.'}</p>
                <button type="button" onClick={() => void reportQuery.refetch()} className="mt-5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700">Tentar novamente</button>
              </div>
            </div>
          ) : requiresAccountSelection ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md rounded-3xl border border-blue-100 bg-blue-50 p-7 text-center">
                <Landmark className="mx-auto text-blue-600" size={28} />
                <h4 className="mt-3 text-sm font-black uppercase tracking-tight text-[#001a33]">Selecione uma conta</h4>
                <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">O extrato só é gerado depois que uma conta bancária ou caixa interno é escolhido.</p>
              </div>
            </div>
          ) : data ? (
            <div className="space-y-5 pt-5">
              {data.mensagem && (
                <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-800" role="status">
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                  <span>{data.mensagem}</span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {reportSummary(data, config, hasStatementRowFilter).map((card) => (
                  <SummaryCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    tone={card.tone === 'rose' ? 'red' : card.tone === 'emerald' ? 'emerald' : card.tone === 'amber' ? 'amber' : card.tone === 'blue' ? 'blue' : 'slate'}
                  />
                ))}
              </div>

              {!data.completo && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
                  A prévia mostra os primeiros {data.limite} lançamentos. Reduza o período ou aplique filtros para gerar um PDF completo.
                </div>
              )}

              {data.resumo.saldoObservacao && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium leading-relaxed text-slate-600">
                  {data.resumo.saldoObservacao}
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                {tipo === 'EXTRATO_CONTA' ? (
                  <table className="min-w-[920px] w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-3 py-3">Movimento</th>
                        <th className="px-3 py-3">Descrição / contraparte</th>
                        <th className="px-3 py-3">Categoria</th>
                        <th className="px-3 py-3 text-right">Entrada</th>
                        <th className="px-3 py-3 text-right">Saída</th>
                        <th className="px-4 py-3 text-right">Saldo da conta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.movimentos.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{formatDate(item.data)}</td>
                          <td className="px-3 py-3"><span className={`inline-flex rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide ${directionClass(item)}`}>{directionText(item)}</span></td>
                          <td className="px-3 py-3"><p className="font-bold text-slate-800">{item.descricao}</p><p className="mt-0.5 text-[10px] font-medium text-slate-400">{item.contraparte}</p><p className="text-[10px] text-slate-500">{item.classificacao === 'TRANSFERENCIA' ? 'Polo relacionado' : 'Polo'}: {item.polo || 'Não identificado'}</p></td>
                          <td className="px-3 py-3 text-slate-600">{item.categoria}</td>
                          <td className="px-3 py-3 text-right font-black text-emerald-700">{item.direcao === 'ENTRADA' ? formatCurrency(item.valor) : '—'}</td>
                          <td className="px-3 py-3 text-right font-black text-red-700">{item.direcao === 'SAIDA' ? formatCurrency(item.valor) : '—'}</td>
                          <td className="px-4 py-3 text-right font-black text-[#001a33]">{item.saldoApos === null ? '—' : formatCurrency(item.saldoApos)}</td>
                        </tr>
                      ))}
                      {data.movimentos.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-xs font-bold uppercase tracking-wider text-slate-400">Nenhum movimento no período selecionado.</td></tr>
                      )}
                    </tbody>
                  </table>
                ) : config.flow ? (
                  <table className="min-w-[880px] w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-3 py-3">Classificação</th>
                        <th className="px-3 py-3">Descrição / contraparte</th>
                        <th className="px-3 py-3">Conta</th>
                        <th className="px-3 py-3">Categoria</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.movimentos.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{formatDate(item.data)}</td>
                          <td className="px-3 py-3"><span className={`inline-flex rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide ${directionClass(item)}`}>{item.classificacao}</span></td>
                          <td className="px-3 py-3"><p className="font-bold text-slate-800">{item.descricao}</p><p className="mt-0.5 text-[10px] font-medium text-slate-400">{item.contraparte}</p></td>
                          <td className="px-3 py-3 text-slate-600">{item.conta}</td>
                          <td className="px-3 py-3 text-slate-600">{item.categoria}</td>
                          <td className={`px-4 py-3 text-right font-black ${item.direcao === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(item.valor)}</td>
                        </tr>
                      ))}
                      {data.movimentos.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-12 text-center text-xs font-bold uppercase tracking-wider text-slate-400">Nenhum movimento no período selecionado.</td></tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="min-w-[880px] w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Vencimento</th>
                        <th className="px-3 py-3 text-center">Status</th>
                        <th className="px-3 py-3">Descrição / contraparte</th>
                        <th className="px-3 py-3">Categoria</th>
                        <th className="px-3 py-3 text-right">Previsto</th>
                        <th className="px-4 py-3 text-right">Realizado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.movimentos.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{formatDate(item.data)}</td>
                          <td className="px-3 py-3 text-center"><span className={`inline-flex rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide ${statusTone(item.status)}`}>{item.status}</span></td>
                          <td className="px-3 py-3"><p className="font-bold text-slate-800">{item.descricao}</p><p className="mt-0.5 text-[10px] font-medium text-slate-400">{item.contraparte}</p></td>
                          <td className="px-3 py-3 text-slate-600">{item.categoria}</td>
                          <td className="px-3 py-3 text-right font-black text-slate-700">{formatCurrency(item.valorPrevisto)}</td>
                          <td className={`px-4 py-3 text-right font-black ${item.valorRealizado > 0 ? (tipo === 'RECEITAS' ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-400'}`}>{item.valorRealizado > 0 ? formatCurrency(item.valorRealizado) : '—'}</td>
                        </tr>
                      ))}
                      {data.movimentos.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-12 text-center text-xs font-bold uppercase tracking-wider text-slate-400">Nenhum lançamento corresponde aos filtros ativos.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default RelatorioMovimentacaoFinanceira;
