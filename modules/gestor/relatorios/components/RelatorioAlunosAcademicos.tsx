import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import DocumentHeader from '../../components/DocumentHeader';
import FinancialReportExportButton from '../../financeiro/components/FinancialReportPreview';
import {
  relatorioAlunosAcademicosService,
  type RelatorioAlunosAcademicosLinha,
  type RelatorioAlunosAcademicosModalidade,
  type RelatorioAlunosAcademicosModoBackend,
  type RelatorioAlunosAcademicosStatus,
} from '../services/relatorio-alunos-academicos.service';
import { formatDate, MODALIDADE_LABELS } from './RelatorioShared';
import ReportWatermark from './ReportWatermark';

export type RelatorioAlunosAcademicosModo =
  | 'cursando'
  | 'finalizados'
  | 'matricula-inicial'
  | 'situacao-aluno';

interface RelatorioAlunosAcademicosProps {
  company: any;
  polo: any;
  modo: RelatorioAlunosAcademicosModo;
}

const modeConfig: Record<RelatorioAlunosAcademicosModo, {
  backendMode: RelatorioAlunosAcademicosModoBackend;
  title: string;
  rightTitle: string;
  rightType: string;
  description: string;
  allowsStatus: boolean;
}> = {
  cursando: {
    backendMode: 'CURSANDO',
    title: 'Relatório de Alunos Cursando',
    rightTitle: 'Controle Acadêmico',
    rightType: 'Alunos Cursando',
    description: 'Relação canônica das matrículas com situação ATIVO. Cadastros PENDENTE não são classificados como cursando.',
    allowsStatus: false,
  },
  finalizados: {
    backendMode: 'FINALIZADOS',
    title: 'Relatório de Alunos Finalizados / Concluintes',
    rightTitle: 'Conclusão Acadêmica',
    rightType: 'Alunos Finalizados',
    description: 'Relação canônica das matrículas com situação CONCLUIDO e seus dados de certificação.',
    allowsStatus: false,
  },
  'matricula-inicial': {
    backendMode: 'MATRICULA_INICIAL',
    title: 'Relatório de Matrícula Inicial',
    rightTitle: 'Base Censo Escolar',
    rightType: 'Matrícula Inicial',
    description: 'Relação de matrículas, turmas, modalidades e dados cadastrais essenciais.',
    allowsStatus: true,
  },
  'situacao-aluno': {
    backendMode: 'SITUACAO_ALUNO',
    title: 'Relatório de Situação do Aluno',
    rightTitle: 'Movimento e Rendimento',
    rightType: 'Situação do Aluno',
    description: 'Situação acadêmica canônica de cada matrícula, inclusive PENDENTE, sem promover cadastros pelo frontend.',
    allowsStatus: true,
  },
};

const academicStatuses: RelatorioAlunosAcademicosStatus[] = [
  'PENDENTE', 'ATIVO', 'CONCLUIDO', 'TRANCADO', 'CANCELADO',
  'REPROVADO', 'EM_DEPENDENCIA', 'DESISTENTE', 'TRANSFERIDO',
];

const academicStatusLabels: Record<RelatorioAlunosAcademicosStatus, string> = {
  PENDENTE: 'Pendente',
  ATIVO: 'Cursando',
  CONCLUIDO: 'Concluído',
  TRANCADO: 'Trancado',
  CANCELADO: 'Cancelado',
  REPROVADO: 'Reprovado',
  EM_DEPENDENCIA: 'Em dependência',
  DESISTENTE: 'Desistente',
  TRANSFERIDO: 'Transferido',
};

const statusStyles: Record<RelatorioAlunosAcademicosStatus, string> = {
  PENDENTE: 'bg-amber-50 text-amber-700',
  ATIVO: 'bg-emerald-50 text-emerald-700',
  CONCLUIDO: 'bg-blue-50 text-blue-700',
  TRANCADO: 'bg-slate-100 text-slate-600',
  CANCELADO: 'bg-rose-50 text-rose-700',
  REPROVADO: 'bg-rose-50 text-rose-700',
  EM_DEPENDENCIA: 'bg-violet-50 text-violet-700',
  DESISTENTE: 'bg-orange-50 text-orange-700',
  TRANSFERIDO: 'bg-cyan-50 text-cyan-700',
};

const modalidadeOptions: RelatorioAlunosAcademicosModalidade[] = [
  'TECNICO', 'EAD', 'LIVRE', 'ESPECIALIZACAO', 'SUPERIOR',
];

const getEmptyMessage = (reason: string | null | undefined, modo: RelatorioAlunosAcademicosModo) => {
  if (reason === 'FILTERS_EXCLUDE_ROWS') return 'Nenhuma matrícula corresponde aos filtros informados.';
  if (reason === 'NO_ROWS_FOR_MODE' && modo === 'cursando') return 'Não existem matrículas com situação ATIVO neste escopo.';
  if (reason === 'NO_ROWS_FOR_MODE' && modo === 'finalizados') return 'Não existem matrículas com situação CONCLUIDO neste escopo.';
  return 'Nenhuma matrícula foi cadastrada para este escopo.';
};

const AcademicStatusBadge: React.FC<{ status: RelatorioAlunosAcademicosStatus }> = ({ status }) => (
  <span className={`inline-flex rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-wider ${statusStyles[status]}`}>
    {academicStatusLabels[status]}
  </span>
);

const AcademicRows: React.FC<{
  modo: RelatorioAlunosAcademicosModo;
  rows: RelatorioAlunosAcademicosLinha[];
  emptyText: string;
}> = ({ modo, rows, emptyText }) => (
  <table className="w-full table-fixed border-collapse text-left">
    <caption className="sr-only">{modeConfig[modo].title}</caption>
    <thead>
      {modo === 'matricula-inicial' ? (
        <tr className="border-b-2 border-slate-300 bg-slate-50 text-[8px] font-bold uppercase tracking-wider text-slate-500">
          <th className="px-2 py-2">Aluno</th><th className="px-2 py-2">Nascimento</th>
          <th className="px-2 py-2">Curso/Turma</th><th className="px-2 py-2">Modalidade</th>
          <th className="px-2 py-2">Polo</th><th className="px-2 py-2">PCD</th>
        </tr>
      ) : modo === 'situacao-aluno' ? (
        <tr className="border-b-2 border-slate-300 bg-slate-50 text-[8px] font-bold uppercase tracking-wider text-slate-500">
          <th className="px-2 py-2">Aluno</th><th className="px-2 py-2">Curso/Turma</th>
          <th className="px-2 py-2">Entrada</th><th className="px-2 py-2">Situação</th>
          <th className="px-2 py-2">Modalidade</th><th className="px-2 py-2">Polo</th>
        </tr>
      ) : (
        <tr className="border-b-2 border-slate-300 bg-slate-50 text-[8px] font-bold uppercase tracking-wider text-slate-500">
          <th className="px-2 py-2">Aluno</th><th className="px-2 py-2">Curso/Turma</th>
          <th className="px-2 py-2">Modalidade</th><th className="px-2 py-2">Período</th>
          <th className="px-2 py-2">Carga</th><th className="px-2 py-2">Certificado</th>
        </tr>
      )}
    </thead>
    <tbody className="divide-y divide-slate-100 text-[9px] text-slate-700">
      {rows.map((item) => modo === 'matricula-inicial' ? (
        <tr key={item.id} className="h-12">
          <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-black text-[#001a33]" title={item.alunoNome}>{item.alunoNome}</p><p className="text-[8px] text-slate-400">CPF {item.alunoCpfMascarado}</p></td>
          <td className="px-2 py-2">{formatDate(item.dataNascimento)}</td>
          <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-bold" title={item.cursoNome}>{item.cursoNome}</p><p className="truncate text-[8px] text-slate-400" title={item.turmaNome}>{item.turmaNome}</p></td>
          <td className="px-2 py-2">{MODALIDADE_LABELS[item.modalidade]}</td>
          <td className="truncate px-2 py-2" title={item.poloNome}>{item.poloNome}</td>
          <td className="px-2 py-2">{item.pcd ? item.pcdTipo || 'Sim' : 'Não'}</td>
        </tr>
      ) : modo === 'situacao-aluno' ? (
        <tr key={item.id} className="h-12">
          <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-black text-[#001a33]" title={item.alunoNome}>{item.alunoNome}</p><p className="text-[8px] text-slate-400">{item.alunoCpfMascarado}</p></td>
          <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-bold" title={item.cursoNome}>{item.cursoNome}</p><p className="truncate text-[8px] text-slate-400" title={item.turmaNome}>{item.turmaNome}</p></td>
          <td className="px-2 py-2">{formatDate(item.dataMatricula)}</td>
          <td className="px-2 py-2"><AcademicStatusBadge status={item.status} /></td>
          <td className="px-2 py-2">{MODALIDADE_LABELS[item.modalidade]}</td>
          <td className="truncate px-2 py-2" title={item.poloNome}>{item.poloNome}</td>
        </tr>
      ) : (
        <tr key={item.id} className="h-12">
          <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-black text-[#001a33]" title={item.alunoNome}>{item.alunoNome}</p><p className="text-[8px] text-slate-400">{item.alunoCpfMascarado}</p></td>
          <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-bold" title={item.cursoNome}>{item.cursoNome}</p><p className="truncate text-[8px] text-slate-400" title={item.turmaNome}>{item.turmaNome}</p></td>
          <td className="px-2 py-2">{MODALIDADE_LABELS[item.modalidade]}</td>
          <td className="px-2 py-2">{formatDate(item.dataInicio)} a {formatDate(item.dataFim)}</td>
          <td className="px-2 py-2">{item.cargaHoraria}h</td>
          <td className="px-2 py-2">{item.certificadoStatus || '—'}</td>
        </tr>
      ))}
      {rows.length === 0 ? (
        <tr><td colSpan={6} className="px-3 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{emptyText}</td></tr>
      ) : null}
    </tbody>
  </table>
);

const RelatorioAlunosAcademicos: React.FC<RelatorioAlunosAcademicosProps> = ({ company, polo, modo }) => {
  const config = modeConfig[modo];
  const scopeKey = polo?.id || 'consolidado';
  const [modalidade, setModalidade] = useState<'todos' | RelatorioAlunosAcademicosModalidade>('todos');
  const [turmaSelection, setTurmaSelection] = useState({ scopeKey, id: 'todos' });
  const [status, setStatus] = useState<'todos' | RelatorioAlunosAcademicosStatus>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm.trim());
  const turmaId = turmaSelection.scopeKey === scopeKey ? turmaSelection.id : 'todos';

  useEffect(() => {
    setTurmaSelection((current) => (
      current.scopeKey === scopeKey ? current : { scopeKey, id: 'todos' }
    ));
  }, [scopeKey]);

  const reportQuery = useQuery({
    queryKey: ['relatorio-alunos-academicos-secure', config.backendMode, polo?.id || 'consolidado', modalidade, turmaId, status, deferredSearch],
    queryFn: () => relatorioAlunosAcademicosService.get({
      modo: config.backendMode,
      poloId: polo?.id || null,
      modalidade: modalidade === 'todos' ? null : modalidade,
      turmaId: turmaId === 'todos' ? null : turmaId,
      status: config.allowsStatus && status !== 'todos' ? status : null,
      busca: deferredSearch || null,
      limit: 500,
      offset: 0,
    }),
    staleTime: 30_000,
  });

  const report = reportQuery.data;
  const rows = report?.linhas || [];
  const issuedAt = report?.meta.generatedAt ? new Date(report.meta.generatedAt) : undefined;
  const selectedStatusLabel = report?.filtrosAplicados.status
    ? academicStatusLabels[report.filtrosAplicados.status]
    : 'Todas as situações';
  const selectedModalidadeLabel = report?.filtrosAplicados.modalidade
    ? MODALIDADE_LABELS[report.filtrosAplicados.modalidade]
    : 'Todas as modalidades';
  const reportEmptyText = getEmptyMessage(report?.emptyReason, modo);

  const pdfColumns = useMemo(() => modo === 'matricula-inicial' ? [
    { label: 'Aluno' }, { label: 'Nascimento' }, { label: 'Curso / turma' },
    { label: 'Modalidade' }, { label: 'Polo' }, { label: 'PCD' },
  ] : modo === 'situacao-aluno' ? [
    { label: 'Aluno' }, { label: 'Curso / turma' }, { label: 'Entrada' },
    { label: 'Situação' }, { label: 'Modalidade' }, { label: 'Polo' },
  ] : [
    { label: 'Aluno' }, { label: 'Curso / turma' }, { label: 'Modalidade' },
    { label: 'Período' }, { label: 'Carga' }, { label: 'Certificado' },
  ], [modo]);

  const pdfRows = useMemo(() => rows.map((item) => ({
    id: item.id,
    cells: modo === 'matricula-inicial'
      ? [`${item.alunoNome}\nCPF ${item.alunoCpfMascarado}`, formatDate(item.dataNascimento), `${item.cursoNome}\n${item.turmaNome}`, MODALIDADE_LABELS[item.modalidade], item.poloNome, item.pcd ? item.pcdTipo || 'Sim' : 'Não']
      : modo === 'situacao-aluno'
        ? [`${item.alunoNome}\n${item.alunoCpfMascarado}`, `${item.cursoNome}\n${item.turmaNome}`, formatDate(item.dataMatricula), academicStatusLabels[item.status], MODALIDADE_LABELS[item.modalidade], item.poloNome]
        : [`${item.alunoNome}\n${item.alunoCpfMascarado}`, `${item.cursoNome}\n${item.turmaNome}`, MODALIDADE_LABELS[item.modalidade], `${formatDate(item.dataInicio)} a ${formatDate(item.dataFim)}`, `${item.cargaHoraria}h`, item.certificadoStatus || '—'],
  })), [modo, rows]);

  const pdfSummary = useMemo(() => report ? [
    { label: 'Registros', value: report.resumo.totalRegistros, tone: 'blue' as const },
    { label: 'Cursando', value: report.resumo.totalAtivos, tone: 'emerald' as const },
    { label: 'Concluídos', value: report.resumo.totalConcluidos, tone: 'amber' as const },
    { label: 'Pendentes', value: report.resumo.totalPendentes, tone: 'slate' as const },
  ] : [], [report]);

  const pdfFilters = useMemo(() => [
    { label: 'Unidade / polo', value: report?.meta.escopo || polo?.nome || 'Consolidado' },
    { label: 'Modalidade', value: selectedModalidadeLabel },
    { label: 'Situação', value: selectedStatusLabel },
    { label: 'Busca', value: report?.filtrosAplicados.busca || 'Sem busca textual' },
  ], [polo?.nome, report?.filtrosAplicados.busca, report?.meta.escopo, selectedModalidadeLabel, selectedStatusLabel]);

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-auto lg:flex-row lg:overflow-hidden">
      <aside className="flex w-full shrink-0 flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:w-80">
        <div className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Filtros do relatório</h3>
            <label className="flex flex-col gap-1"><span className="ml-1 text-[10px] font-bold uppercase text-slate-400">Buscar aluno</span><input type="search" maxLength={160} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nome, CPF, curso ou turma..." className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500" /></label>
            <label className="flex flex-col gap-1"><span className="ml-1 text-[10px] font-bold uppercase text-slate-400">Modalidade</span><select value={modalidade} onChange={(event) => { setModalidade(event.target.value as typeof modalidade); setTurmaSelection({ scopeKey, id: 'todos' }); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"><option value="todos">Todas as modalidades</option>{modalidadeOptions.map((item) => <option key={item} value={item}>{MODALIDADE_LABELS[item]}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="ml-1 text-[10px] font-bold uppercase text-slate-400">Turma</span><select value={turmaId} onChange={(event) => setTurmaSelection({ scopeKey, id: event.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"><option value="todos">Todas as turmas</option>{report?.turmasDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome} {item.codigo ? `(${item.codigo})` : ''}</option>)}</select></label>
            {config.allowsStatus ? <label className="flex flex-col gap-1"><span className="ml-1 text-[10px] font-bold uppercase text-slate-400">Situação acadêmica</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"><option value="todos">Todas as situações</option>{academicStatuses.map((item) => <option key={item} value={item}>{academicStatusLabels[item]}</option>)}</select></label> : null}
          </div>

          <section className="space-y-3 border-t border-slate-100 pt-4" aria-label="Resumo acadêmico devolvido pelo backend">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Resumo do backend</h4>
            <div className="grid grid-cols-2 gap-2">{pdfSummary.map((item) => <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{item.label}</p><p className="mt-0.5 text-lg font-black text-[#001a33]">{item.value}</p></div>)}</div>
          </section>

          {reportQuery.isError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-800" role="alert"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 shrink-0" size={15} /><p className="text-xs font-semibold">Não foi possível consultar o relatório. O erro não foi convertido em uma lista vazia.</p></div><button type="button" onClick={() => { void reportQuery.refetch(); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase"><RefreshCw size={13} /> Tentar novamente</button></div> : null}
          {report?.pageInfo.hasMore ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800" role="status">Há mais de {report.pageInfo.returned} registros. Refine os filtros antes de gerar o documento completo.</div> : null}
        </div>

        <FinancialReportExportButton
          title={config.title}
          subtitle={config.description}
          rightTitle={config.rightTitle}
          rightType={config.rightType}
          documentSection="Acadêmico"
          documentSubject={config.title}
          documentKeywords="acadêmico, alunos, matrículas, gestão"
          fileName={`relatorio-${modo}`}
          columns={pdfColumns}
          rows={pdfRows}
          summaryCards={pdfSummary}
          filters={pdfFilters}
          footerNote="Filtros, classificação acadêmica, KPIs, ordem, mascaramento de CPF e limite foram resolvidos pelo backend."
          recordLabel="matrícula(s)"
          company={company}
          polo={polo}
          poloId={polo?.id || null}
          tone="blue"
          issuedAt={issuedAt}
          buttonLabel="Prévia / PDF"
          buttonClassName="mt-6 w-full"
          disabled={!report || reportQuery.isFetching || reportQuery.isError || report.pageInfo.hasMore}
        />
      </aside>

      <main className="flex flex-1 justify-center overflow-auto rounded-3xl bg-slate-200/40 p-4 custom-scrollbar sm:p-8">
        {reportQuery.isPending && !report ? <div className="flex w-full items-center justify-center py-20" role="status" aria-label="Carregando relatório acadêmico"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div> : (
          <section className="relative box-border flex min-h-[297mm] w-[210mm] min-w-[210mm] shrink-0 flex-col bg-white p-10 text-slate-800 shadow-lg">
            <ReportWatermark polo={polo} orientation="portrait" />
            <DocumentHeader company={company} polo={polo} orientation="portrait" meta={{ title: config.rightTitle, label: 'Tipo', value: config.rightType }} />
            <div className="relative z-10 mb-5 border-b pb-4"><h3 className="text-lg font-black uppercase tracking-tight text-slate-800">{config.title}</h3><p className="mt-1 text-xs font-medium text-slate-500">{config.description}</p></div>
            <div className="relative z-10 mb-5 grid grid-cols-3 gap-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Unidade / polo</span><p className="mt-0.5 text-xs font-bold uppercase text-slate-800">{report?.meta.escopo || polo?.nome || 'Consolidado'}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Modalidade</span><p className="mt-0.5 text-xs font-bold text-slate-800">{selectedModalidadeLabel}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Situação</span><p className="mt-0.5 text-xs font-bold text-slate-800">{selectedStatusLabel}</p></div></div>
            <div className="relative z-10 mb-5 grid grid-cols-4 gap-3">{pdfSummary.map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{item.label}</p><p className="mt-1 text-lg font-black text-[#001a33]">{item.value}</p></div>)}</div>
            <div className="relative z-10 flex-1"><AcademicRows modo={modo} rows={rows} emptyText={reportEmptyText} /></div>
            <footer className="relative z-10 mt-5 border-t border-slate-200 pt-3 text-[8px] font-semibold text-slate-400">Emitido em {issuedAt?.toLocaleString('pt-BR') || '—'} · classificação e totais canônicos do backend.</footer>
          </section>
        )}
      </main>
    </div>
  );
};

export default RelatorioAlunosAcademicos;
