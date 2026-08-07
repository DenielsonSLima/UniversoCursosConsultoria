import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Info, RefreshCw, ShieldAlert } from 'lucide-react';
import { relatoriosKeys } from '../../relatorios.query-keys';
import {
  A4ReportShell,
  EmptyReportState,
  FilterField,
  FilterSelect,
  MODALIDADE_LABELS,
  ReportFilterPanel,
  ReportKpiCard,
  ReportMetaCard,
  STATUS_LABELS,
  SummaryCard,
} from '../../components/RelatorioShared';
import { paginateReportItems } from '../../components/report-pagination';
import { matriculaInicialCensoService } from './matricula-inicial.service';
import {
  CensoDomain,
  CensoReadinessFilters,
  CensoSeverity,
} from './matricula-inicial.types';

interface DiagnosticoMatriculaInicialProps {
  company: any;
  polo: any;
  poloId?: string | null;
}

const STRUCTURAL_LIMITATIONS = [
  'Código Inep e configuração censitária da escola/polo.',
  'Código CNCT, etapa e modalidade censitária do curso.',
  'Mediação pedagógica e características oficiais da turma.',
  'Vínculos censitários de gestor, professores, tutores e instrutores.',
  'Snapshot imutável na data oficial e leiaute anual do Educacenso.',
];
const ISSUES_PER_BATCH = 40;

const DiagnosticoMatriculaInicial: React.FC<DiagnosticoMatriculaInicialProps> = ({ company, polo, poloId }) => {
  const [modalidade, setModalidade] = useState<CensoReadinessFilters['modalidade']>('TECNICO');
  const [status, setStatus] = useState('ATIVO');
  const [severity, setSeverity] = useState<'todos' | CensoSeverity>('todos');
  const [domain, setDomain] = useState<'todos' | CensoDomain>('todos');
  const [issuePage, setIssuePage] = useState(1);

  const filters: CensoReadinessFilters = {
    poloId: poloId || null,
    modalidade,
    status,
  };
  const readinessQuery = useQuery({
    queryKey: relatoriosKeys.censo.readiness(filters),
    queryFn: ({ signal }) => matriculaInicialCensoService.getReadiness(filters, signal),
    staleTime: 60_000,
    retry: 1,
  });

  const result = readinessQuery.data;
  const filteredIssues = useMemo(() => (result?.issues || []).filter((item) => (
    (severity === 'todos' || item.severity === severity)
    && (domain === 'todos' || item.domain === domain)
  )), [domain, readinessQuery.data, severity]);
  const filteredTotals = useMemo(() => ({
    erros: filteredIssues.filter((item) => item.severity === 'erro').length,
    avisos: filteredIssues.filter((item) => item.severity === 'aviso').length,
    alunosComPendenciaCadastral: new Set(
      filteredIssues
        .filter((item) => item.entityType === 'ALUNO')
        .map((item) => item.entityId),
    ).size,
  }), [filteredIssues]);
  const issuePages = Math.max(1, Math.ceil(filteredIssues.length / ISSUES_PER_BATCH));
  const visibleIssues = filteredIssues.slice(
    (issuePage - 1) * ISSUES_PER_BATCH,
    issuePage * ISSUES_PER_BATCH,
  );
  const issueRangeStart = filteredIssues.length === 0 ? 0 : ((issuePage - 1) * ISSUES_PER_BATCH) + 1;
  const issueRangeEnd = Math.min(issuePage * ISSUES_PER_BATCH, filteredIssues.length);
  const documentIssuePages = useMemo(
    () => paginateReportItems(visibleIssues, 4, 10),
    [visibleIssues],
  );

  useEffect(() => {
    setIssuePage(1);
  }, [domain, modalidade, poloId, severity, status]);

  useEffect(() => {
    setIssuePage((value) => Math.min(value, issuePages));
  }, [issuePages]);

  const renderLimitations = () => (
    <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 shrink-0 text-red-700" size={18} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-red-800">Limitações estruturais ainda não modeladas</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-[9px] text-red-900 sm:grid-cols-2">
            {STRUCTURAL_LIMITATIONS.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );

  const renderIssuePage = (pageIssues: typeof visibleIssues, pageIndex: number) => (
    <>
      {pageIndex === 0 && renderLimitations()}
      {readinessQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center">
          <p className="text-sm font-bold text-red-700">Não foi possível calcular o diagnóstico.</p>
          <button type="button" onClick={() => void readinessQuery.refetch()} className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-[10px] font-black uppercase text-white">
            Tentar novamente
          </button>
        </div>
      ) : pageIssues.length === 0 ? (
        <EmptyReportState message="Nenhuma pendência encontrada nos filtros atuais. As limitações estruturais acima ainda precisam ser tratadas." />
      ) : (
        <div className="space-y-2">
          {pageIssues.map((item) => (
            <div key={item.id} className={`flex h-[58px] items-start gap-3 overflow-hidden rounded-xl border px-3 py-2 ${item.severity === 'erro' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
              {item.severity === 'erro'
                ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-700" />
                : <Info size={15} className="mt-0.5 shrink-0 text-amber-700" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[7px] font-black uppercase ${item.severity === 'erro' ? 'bg-red-700 text-white' : 'bg-amber-600 text-white'}`}>
                    {item.severity}
                  </span>
                  <span className="text-[8px] font-black uppercase text-slate-500">{item.entityType}</span>
                  <span className="truncate text-[9px] font-black text-[#001a33]">{item.entityName}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] font-medium text-slate-700" title={item.message}>{item.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-auto lg:flex-row lg:overflow-hidden">
      <ReportFilterPanel
        title="Diagnóstico do Censo"
        printDisabled={readinessQuery.isFetching || readinessQuery.isError}
        printLabel="Imprimir lote atual / PDF"
        summary={
          <>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Prontidão atual</h4>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Alunos" value={result?.totalAlunos || 0} tone="blue" />
              <SummaryCard label="Turmas" value={result?.totalTurmas || 0} />
              <SummaryCard label="Erros filtrados" value={filteredTotals.erros} tone="red" />
              <SummaryCard label="Avisos filtrados" value={filteredTotals.avisos} tone="amber" />
            </div>
          </>
        }
      >
        <FilterField label="Modalidade">
          <FilterSelect value={modalidade} onChange={(event) => setModalidade(event.target.value as CensoReadinessFilters['modalidade'])}>
            {Object.entries(MODALIDADE_LABELS).filter(([key]) => key !== 'SUPERIOR').map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </FilterSelect>
        </FilterField>
        <FilterField label="Situação da matrícula">
          <FilterSelect value={status} onChange={(event) => setStatus(event.target.value)}>
            {['todos', 'ATIVO', 'PENDENTE', 'CONCLUIDO', 'TRANCADO', 'CANCELADO', 'DESISTENTE', 'TRANSFERIDO', 'REPROVADO'].map((value) => (
              <option key={value} value={value}>{STATUS_LABELS[value] || value}</option>
            ))}
          </FilterSelect>
        </FilterField>
        <FilterField label="Severidade">
          <FilterSelect value={severity} onChange={(event) => setSeverity(event.target.value as 'todos' | CensoSeverity)}>
            <option value="todos">Erros e avisos</option>
            <option value="erro">Somente erros</option>
            <option value="aviso">Somente avisos</option>
          </FilterSelect>
        </FilterField>
        <FilterField label="Domínio">
          <FilterSelect value={domain} onChange={(event) => setDomain(event.target.value as 'todos' | CensoDomain)}>
            <option value="todos">Alunos e turmas</option>
            <option value="aluno">Alunos</option>
            <option value="turma">Turmas</option>
          </FilterSelect>
        </FilterField>
        <button
          type="button"
          onClick={() => void readinessQuery.refetch()}
          disabled={readinessQuery.isFetching}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase text-blue-700"
        >
          <RefreshCw size={13} className={readinessQuery.isFetching ? 'animate-spin' : ''} />
          {readinessQuery.isFetching ? 'Recalculando...' : 'Recalcular diagnóstico'}
        </button>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-medium leading-relaxed text-amber-900">
          <p className="font-black uppercase">Visão atual, não oficial</p>
          <p className="mt-1">Não reconstrói a situação histórica de 27/05/2026 e não substitui o Educacenso.</p>
        </div>
        {filteredIssues.length > ISSUES_PER_BATCH && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Lote anterior de pendências"
                disabled={issuePage <= 1}
                onClick={() => setIssuePage((value) => Math.max(1, value - 1))}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[9px] font-black uppercase text-slate-500" aria-live="polite">
                Lote {issuePage} de {issuePages}
              </span>
              <button
                type="button"
                aria-label="Próximo lote de pendências"
                disabled={issuePage >= issuePages}
                onClick={() => setIssuePage((value) => Math.min(issuePages, value + 1))}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <p className="text-center text-[9px] font-medium text-slate-500">
              Pendências {issueRangeStart}–{issueRangeEnd} de {filteredIssues.length}. Imprima cada lote para obter o conjunto completo.
            </p>
          </div>
        )}
      </ReportFilterPanel>

      <A4ReportShell
        company={company}
        polo={polo}
        loading={readinessQuery.isLoading}
        printAreaId="print-area-censo-readiness"
        rightTitle="Conformidade Acadêmica"
        rightType="Diagnóstico atual"
        title="Prontidão para a Matrícula Inicial do Censo"
        description="Conferência cadastral dinâmica do universo filtrado, inicialmente matrículas técnicas ativas. Este documento não é uma declaração oficial, snapshot censitário ou arquivo do Educacenso."
        meta={
          <>
            <ReportMetaCard label="Base temporal" value="Estado atual do sistema" />
            <ReportMetaCard label="Modalidade" value={MODALIDADE_LABELS[modalidade]} />
            <ReportMetaCard label="Situação" value={STATUS_LABELS[status] || status} />
            <ReportMetaCard label="Severidade" value={severity === 'todos' ? 'Erros e avisos' : severity} />
            <ReportMetaCard label="Domínio" value={domain === 'todos' ? 'Alunos e turmas' : domain} />
            <ReportMetaCard label="Unidade / Polo" value={polo?.nome || 'Todos os polos autorizados'} />
            <ReportMetaCard label="Lote de pendências" value={`${issuePage} de ${issuePages} · itens ${issueRangeStart}–${issueRangeEnd} de ${filteredIssues.length}`} />
          </>
        }
        kpis={
          <>
            <ReportKpiCard label="Alunos c/ pendência cadastral" value={filteredTotals.alunosComPendenciaCadastral} tone="red" />
            <ReportKpiCard label="Erros filtrados" value={filteredTotals.erros} tone="red" />
            <ReportKpiCard label="Avisos filtrados" value={filteredTotals.avisos} tone="amber" />
          </>
        }
        pages={documentIssuePages.map((pageIssues, pageIndex) => renderIssuePage(pageIssues, pageIndex))}
      />
    </div>
  );
};

export default DiagnosticoMatriculaInicial;
