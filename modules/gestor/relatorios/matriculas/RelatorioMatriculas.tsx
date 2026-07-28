import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { relatoriosKeys } from '../relatorios.query-keys';
import {
  A4ReportShell,
  EmptyReportState,
  FilterField,
  FilterInput,
  FilterSelect,
  formatDate,
  MODALIDADE_LABELS,
  ReportFilterPanel,
  ReportKpiCard,
  ReportMetaCard,
  STATUS_LABELS,
  SummaryCard,
} from '../components/RelatorioShared';
import { paginateReportItems } from '../components/report-pagination';
import { matriculasReportService } from './matriculas.service';
import { MatriculasModalidade, MatriculasReportFilters } from './matriculas.types';
import { maskCpf } from './matriculas.utils';

interface RelatorioMatriculasProps {
  company: any;
  polo: any;
  poloId?: string | null;
}

const STATUS_OPTIONS = [
  'todos',
  'ATIVO',
  'PENDENTE',
  'CONCLUIDO',
  'TRANCADO',
  'CANCELADO',
  'DESISTENTE',
  'TRANSFERIDO',
  'REPROVADO',
];

const RelatorioMatriculas: React.FC<RelatorioMatriculasProps> = ({ company, polo, poloId }) => {
  const [modalidade, setModalidade] = useState<MatriculasModalidade>('todos');
  const [turmaId, setTurmaId] = useState('todos');
  const [status, setStatus] = useState('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);
  const [showFullCpf, setShowFullCpf] = useState(false);

  const filters: MatriculasReportFilters = {
    poloId: poloId || null,
    modalidade,
    turmaId,
    status,
    dataInicio,
    dataFim,
    page,
    pageSize: 25,
  };
  const dateRangeInvalid = Boolean(dataInicio && dataFim && dataInicio > dataFim);

  const reportQuery = useQuery({
    queryKey: relatoriosKeys.matriculas.list(filters),
    queryFn: ({ signal }) => matriculasReportService.list(filters, signal),
    enabled: !dateRangeInvalid,
    staleTime: 30_000,
    retry: 1,
  });
  const turmasQuery = useQuery({
    queryKey: relatoriosKeys.matriculas.turmas(poloId, modalidade),
    queryFn: ({ signal }) => matriculasReportService.listTurmas(poloId, modalidade, signal),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const result = reportQuery.data;
  const rows = result?.rows || [];
  const totalPages = Math.max(1, Math.ceil((result?.total || 0) / (result?.pageSize || 25)));
  const documentPages = useMemo(() => paginateReportItems(rows, 8, 14), [rows]);
  const selectedTurma = (turmasQuery.data || []).find((turma) => turma.id === turmaId);
  const pageTotals = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {}), [rows]);

  const resetPage = (change: () => void) => {
    change();
    setPage(1);
  };

  useEffect(() => {
    if (turmaId !== 'todos' && turmasQuery.isSuccess && !selectedTurma) {
      setTurmaId('todos');
      setPage(1);
    }
  }, [selectedTurma, turmaId, turmasQuery.isSuccess]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const renderTable = (pageRows: typeof rows) => {
    if (reportQuery.isError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center">
          <p className="text-sm font-bold text-red-700">Não foi possível carregar as matrículas.</p>
          <button type="button" onClick={() => void reportQuery.refetch()} className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-[10px] font-black uppercase text-white">
            Tentar novamente
          </button>
        </div>
      );
    }

    if (pageRows.length === 0) return <EmptyReportState />;

    return (
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Matrículas filtradas por aluno, curso, turma, modalidade, situação e polo</caption>
        <thead>
          <tr className="border-b-2 border-slate-300 bg-slate-50 text-[8px] font-bold uppercase tracking-wider text-slate-500">
            <th scope="col" className="px-2 py-2">Matrícula / aluno</th>
            <th scope="col" className="px-2 py-2">Curso / turma</th>
            <th scope="col" className="px-2 py-2">Modalidade</th>
            <th scope="col" className="px-2 py-2">Entrada</th>
            <th scope="col" className="px-2 py-2">Situação</th>
            <th scope="col" className="px-2 py-2">Polo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pageRows.map((row) => (
            <tr key={row.id} className="h-12 text-[9px] text-slate-700">
              <td className="overflow-hidden px-2 py-1.5">
                <p className="truncate font-mono text-[8px] font-bold text-blue-700" title={row.matricula}>{row.matricula}</p>
                <p className="truncate font-black text-[#001a33]" title={row.alunoNome}>{row.alunoNome}</p>
                <p className="text-[8px] text-slate-400">{showFullCpf ? row.alunoCpf : maskCpf(row.alunoCpf)}</p>
              </td>
              <td className="overflow-hidden px-2 py-1.5">
                <p className="truncate font-bold" title={row.cursoNome}>{row.cursoNome}</p>
                <p className="truncate text-[8px] text-slate-400" title={row.turmaNome}>{row.turmaNome}</p>
              </td>
              <td className="px-2 py-2">{MODALIDADE_LABELS[row.modalidade] || row.modalidade}</td>
              <td className="px-2 py-2">{formatDate(row.dataMatricula)}</td>
              <td className="px-2 py-2">
                <span className="rounded-lg bg-blue-50 px-2 py-1 text-[8px] font-black uppercase text-blue-700">
                  {STATUS_LABELS[row.status] || row.status}
                </span>
              </td>
              <td className="truncate px-2 py-2" title={row.poloNome}>{row.poloNome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-auto lg:flex-row lg:overflow-hidden">
      <ReportFilterPanel
        title="Filtros de Matrículas"
        printDisabled={reportQuery.isFetching || reportQuery.isError || dateRangeInvalid}
        printLabel="Imprimir lote atual / PDF"
        summary={
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Resultado</h4>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Total filtrado" value={result?.total || 0} tone="blue" />
              <SummaryCard label="Neste lote" value={rows.length} />
              <SummaryCard label="Ativas no lote" value={pageTotals.ATIVO || 0} tone="emerald" />
              <SummaryCard label="Pendentes no lote" value={pageTotals.PENDENTE || 0} tone="amber" />
            </div>
          </>
        }
      >
        <FilterField label="Modalidade">
          <FilterSelect
            value={modalidade}
            onChange={(event) => resetPage(() => {
              setTurmaId('todos');
              setModalidade(event.target.value as MatriculasModalidade);
            })}
          >
            {Object.entries(MODALIDADE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </FilterSelect>
        </FilterField>
        <FilterField label="Turma">
          <FilterSelect value={turmaId} onChange={(event) => resetPage(() => setTurmaId(event.target.value))}>
            <option value="todos">Todas as turmas</option>
            {(turmasQuery.data || []).map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turma.nome}{turma.codigo ? ` (${turma.codigo})` : ''}
              </option>
            ))}
          </FilterSelect>
        </FilterField>
        <FilterField label="Situação">
          <FilterSelect value={status} onChange={(event) => resetPage(() => setStatus(event.target.value))}>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>{STATUS_LABELS[value] || value}</option>
            ))}
          </FilterSelect>
        </FilterField>
        <div className="grid grid-cols-2 gap-2">
          <FilterField label="De">
            <FilterInput type="date" value={dataInicio} onChange={(event) => resetPage(() => setDataInicio(event.target.value))} />
          </FilterField>
          <FilterField label="Até">
            <FilterInput type="date" value={dataFim} onChange={(event) => resetPage(() => setDataFim(event.target.value))} />
          </FilterField>
        </div>
        {dateRangeInvalid && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700" role="alert">
            A data inicial não pode ser posterior à data final.
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase text-slate-600">
          <input type="checkbox" checked={showFullCpf} onChange={(event) => setShowFullCpf(event.target.checked)} />
          Exibir CPF completo
        </label>
        <button
          type="button"
          onClick={() => void Promise.all([reportQuery.refetch(), turmasQuery.refetch()])}
          disabled={reportQuery.isFetching || turmasQuery.isFetching || dateRangeInvalid}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase text-blue-700"
        >
          <RefreshCw size={13} className={reportQuery.isFetching || turmasQuery.isFetching ? 'animate-spin' : ''} />
          {reportQuery.isFetching || turmasQuery.isFetching ? 'Atualizando...' : 'Atualizar dados'}
        </button>
        {turmasQuery.isError && (
          <p className="text-[10px] font-bold text-red-600" role="alert">Não foi possível carregar as turmas.</p>
        )}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
          <button type="button" aria-label="Página anterior dos dados" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg p-2 text-slate-500 disabled:opacity-30">
            <ChevronLeft size={15} />
          </button>
          <span className="text-[10px] font-black uppercase text-slate-600">Lote {page} de {totalPages}</span>
          <button type="button" aria-label="Próxima página dos dados" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg p-2 text-slate-500 disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>
        <p className="text-[9px] font-medium leading-relaxed text-slate-500" aria-live="polite">
          O PDF contém o lote {page} de {totalPages}. Para obter o conjunto completo, imprima cada lote.
        </p>
      </ReportFilterPanel>

      <A4ReportShell
        company={company}
        polo={polo}
        loading={reportQuery.isLoading}
        printAreaId="print-area-matriculas"
        rightTitle="Controle Acadêmico"
        rightType="Matrículas"
        title="Relatório Operacional de Matrículas"
        description="Relação paginada de vínculos acadêmicos conforme os filtros selecionados. Os indicadores por situação referem-se ao lote exibido."
        meta={
          <>
            <ReportMetaCard label="Modalidade" value={MODALIDADE_LABELS[modalidade]} />
            <ReportMetaCard label="Situação" value={STATUS_LABELS[status] || status} />
            <ReportMetaCard label="Turma" value={selectedTurma?.nome || 'Todas'} />
            <ReportMetaCard label="Período" value={dataInicio || dataFim ? `${formatDate(dataInicio) } a ${formatDate(dataFim)}` : 'Todo o período'} />
            <ReportMetaCard label="Unidade / Polo" value={polo?.nome || 'Todos os polos autorizados'} />
            <ReportMetaCard label="Lote de dados" value={`${page} de ${totalPages}`} />
          </>
        }
        kpis={
          <>
            <ReportKpiCard label="Total filtrado" value={result?.total || 0} tone="blue" />
            <ReportKpiCard label="Lote de dados" value={`${page}/${totalPages}`} />
            <ReportKpiCard label="Registros neste lote" value={rows.length} tone="emerald" />
          </>
        }
        pages={documentPages.map((pageRows) => renderTable(pageRows))}
      />
    </div>
  );
};

export default RelatorioMatriculas;
