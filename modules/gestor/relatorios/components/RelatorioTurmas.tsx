import React, { useDeferredValue, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import DocumentHeader from '../../components/DocumentHeader';
import FinancialReportExportButton from '../../financeiro/components/FinancialReportPreview';
import {
  relatorioTurmasService,
  type RelatorioTurmasModalidade,
  type RelatorioTurmasStatus,
} from '../services/relatorio-turmas.service';
import ReportWatermark from './ReportWatermark';

interface RelatorioTurmasProps {
  company: any;
  polo: any;
}

const modalidadeLabels: Record<RelatorioTurmasModalidade, string> = {
  TECNICO: 'Cursos Técnicos',
  LIVRE: 'Cursos Livres',
  ESPECIALIZACAO: 'Especialização',
  EAD: 'Ensino EAD',
  SUPERIOR: 'Ensino Superior',
};

const statusLabels: Record<RelatorioTurmasStatus, string> = {
  PLANEJADA: 'Planejada',
  INSCRICOES_ABERTAS: 'Inscrições abertas',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada',
};

const statusStyles: Record<RelatorioTurmasStatus, string> = {
  PLANEJADA: 'bg-slate-100 text-slate-600',
  INSCRICOES_ABERTAS: 'bg-cyan-50 text-cyan-700',
  EM_ANDAMENTO: 'bg-blue-50 text-blue-700',
  FINALIZADA: 'bg-emerald-50 text-emerald-700',
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const RelatorioTurmas: React.FC<RelatorioTurmasProps> = ({ company, polo }) => {
  const [selectedModalidade, setSelectedModalidade] = useState<'todos' | RelatorioTurmasModalidade>('todos');
  const [selectedStatus, setSelectedStatus] = useState<'todos' | RelatorioTurmasStatus>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm.trim());

  const reportQuery = useQuery({
    queryKey: [
      'relatorio-turmas-secure',
      polo?.id || 'consolidado',
      selectedModalidade,
      selectedStatus,
      deferredSearch,
    ],
    queryFn: () => relatorioTurmasService.get({
      poloId: polo?.id || null,
      modalidade: selectedModalidade === 'todos' ? null : selectedModalidade,
      status: selectedStatus === 'todos' ? null : selectedStatus,
      busca: deferredSearch || null,
      limit: 500,
      offset: 0,
    }),
    staleTime: 30_000,
  });

  const report = reportQuery.data;
  const rows = report?.linhas || [];
  const selectedModalidadeLabel = selectedModalidade === 'todos'
    ? 'Todas as modalidades'
    : modalidadeLabels[selectedModalidade];
  const selectedStatusLabel = selectedStatus === 'todos'
    ? 'Todos os status'
    : statusLabels[selectedStatus];
  const issuedAt = report?.meta.generatedAt ? new Date(report.meta.generatedAt) : undefined;

  const pdfColumns = useMemo(() => [
    { label: 'Código' },
    { label: 'Turma' },
    { label: 'Curso' },
    { label: 'Modalidade', align: 'center' as const },
    { label: 'Situação', align: 'center' as const },
    { label: 'Alunos ativos', align: 'right' as const },
  ], []);

  const pdfRows = useMemo(() => rows.map((item) => ({
    id: item.id,
    cells: [
      item.codigo || '—',
      item.nome,
      item.cursoNome,
      modalidadeLabels[item.modalidade],
      statusLabels[item.status],
      item.alunosAtivos,
    ],
  })), [rows]);

  const pdfSummary = useMemo(() => report ? [
    { label: 'Turmas', value: report.resumo.totalTurmas, tone: 'blue' as const },
    { label: 'Alunos ativos', value: report.resumo.totalAlunosAtivos, tone: 'emerald' as const },
  ] : [], [report]);

  const pdfFilters = useMemo(() => [
    { label: 'Unidade / polo', value: report?.meta.escopo || polo?.nome || 'Consolidado' },
    { label: 'Modalidade', value: selectedModalidadeLabel },
    { label: 'Situação', value: selectedStatusLabel },
    { label: 'Busca', value: report?.filtrosAplicados.busca || 'Sem busca textual' },
  ], [polo?.nome, report?.filtrosAplicados.busca, report?.meta.escopo, selectedModalidadeLabel, selectedStatusLabel]);

  const emptyMessage = report?.emptyReason === 'FILTERS_EXCLUDE_ROWS'
    ? 'Nenhuma turma corresponde aos filtros informados.'
    : 'Nenhuma turma foi cadastrada para este escopo.';

  return (
    <div className="flex h-full w-full flex-col gap-6 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:w-72">
        <div className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-[#001a33]">Filtros do relatório</h3>
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">Buscar turma</span>
                <input
                  type="search"
                  placeholder="Nome, código ou curso..."
                  maxLength={160}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-blue-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">Modalidade</span>
                <select
                  value={selectedModalidade}
                  onChange={(event) => setSelectedModalidade(event.target.value as typeof selectedModalidade)}
                  className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="todos">Todas as modalidades</option>
                  {Object.entries(modalidadeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">Status operacional</span>
                <select
                  value={selectedStatus}
                  onChange={(event) => setSelectedStatus(event.target.value as typeof selectedStatus)}
                  className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="todos">Todos os status</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <section className="space-y-3 border-t border-slate-100 pt-4" aria-label="Resumo do relatório">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Resumo do backend</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Turmas</p>
                <p className="mt-0.5 text-lg font-black text-[#001a33]">{report?.resumo.totalTurmas ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Alunos ativos</p>
                <p className="mt-0.5 text-lg font-black text-[#001a33]">{report?.resumo.totalAlunosAtivos ?? '—'}</p>
              </div>
            </div>
          </section>

          {reportQuery.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-800" role="alert">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 shrink-0" size={15} />
                <p className="text-xs font-semibold">Não foi possível consultar as turmas. O erro não foi convertido em uma lista vazia.</p>
              </div>
              <button
                type="button"
                onClick={() => { void reportQuery.refetch(); }}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider"
              >
                <RefreshCw size={13} /> Tentar novamente
              </button>
            </div>
          ) : null}

          {report?.pageInfo.hasMore ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800" role="status">
              Há mais de {report.pageInfo.returned} turmas. Refine os filtros antes de gerar o documento completo.
            </div>
          ) : null}
        </div>

        <FinancialReportExportButton
          title="Status operacional de turmas"
          subtitle="Relação canônica de turmas e quantidade de matrículas com situação ATIVO."
          rightTitle="Relatório gerencial"
          rightType="Controle de turmas"
          documentSection="Acadêmico"
          documentSubject="Relatório institucional de turmas"
          documentKeywords="acadêmico, turmas, matrículas, gestão"
          fileName="relatorio-turmas"
          columns={pdfColumns}
          rows={pdfRows}
          summaryCards={pdfSummary}
          filters={pdfFilters}
          footerNote="Totais, filtros, status e ordenação foram resolvidos pelo backend do Portal de Gestão."
          recordLabel="turma(s)"
          company={company}
          polo={polo}
          poloId={polo?.id || null}
          tone="blue"
          issuedAt={issuedAt}
          buttonLabel="Prévia / PDF"
          buttonClassName="mt-6 w-full"
          disabled={
            !report
            || reportQuery.isPending
            || reportQuery.isFetching
            || reportQuery.isError
            || report.pageInfo.hasMore
          }
        />
      </aside>

      <main className="flex flex-1 justify-center overflow-auto rounded-3xl bg-slate-200/40 p-4 custom-scrollbar sm:p-8">
        {reportQuery.isPending && !report ? (
          <div className="flex w-full items-center justify-center py-20" role="status" aria-label="Carregando relatório de turmas">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <div className="relative box-border flex min-h-[297mm] w-[210mm] min-w-[210mm] shrink-0 flex-col bg-white p-10 text-slate-800 shadow-lg">
            <ReportWatermark polo={polo} orientation="portrait" />
            <DocumentHeader
              company={company}
              polo={polo}
              orientation="portrait"
              meta={{ title: 'Relatório gerencial', label: 'Tipo', value: 'Controle de turmas' }}
            />

            <div className="relative z-10 mb-6 border-b pb-4">
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Status operacional de turmas</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                A situação, a ordenação e o quantitativo de alunos ativos desta prévia vêm do contrato canônico do backend.
              </p>
            </div>

            <div className="relative z-10 mb-6 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Unidade / polo</span>
                <p className="mt-0.5 text-xs font-bold uppercase text-slate-800">{report?.meta.escopo || polo?.nome || 'Consolidado'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Emissão</span>
                <p className="mt-0.5 text-xs font-bold text-slate-800">{issuedAt?.toLocaleString('pt-BR') || '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Filtros</span>
                <p className="mt-0.5 text-xs font-bold uppercase text-slate-800">{selectedModalidadeLabel} · {selectedStatusLabel}</p>
              </div>
            </div>

            <div className="relative z-10 flex-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-2 py-2">Turma</th>
                    <th className="px-2 py-2">Curso</th>
                    <th className="px-2 py-2 text-center">Período</th>
                    <th className="px-2 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Alunos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5 text-[10px] font-bold text-[#001a33]">{item.codigo || '—'}</td>
                      <td className="max-w-[145px] px-2 py-2.5 font-bold" title={item.nome}>{item.nome}</td>
                      <td className="max-w-[125px] px-2 py-2.5 text-slate-500" title={item.cursoNome}>{item.cursoNome}</td>
                      <td className="px-2 py-2.5 text-center text-[9px] text-slate-500">
                        {formatDate(item.dataInicio)} — {formatDate(item.dataPrevisaoTermino)}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${statusStyles[item.status]}`}>
                          {statusLabels[item.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">{item.alunosAtivos}</td>
                    </tr>
                  ))}
                  {!reportQuery.isError && rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {emptyMessage}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <footer className="relative z-10 mt-8 flex items-end justify-between border-t border-slate-200 pt-6 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <div>
                <p>Universo Cursos e Consultoria</p>
                <p className="mt-0.5 text-[8px] font-medium lowercase">Prévia do contrato canônico do relatório.</p>
              </div>
              <p>{report?.pageInfo.returned ?? 0} de {report?.pageInfo.total ?? 0} registro(s)</p>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
};

export default RelatorioTurmas;
