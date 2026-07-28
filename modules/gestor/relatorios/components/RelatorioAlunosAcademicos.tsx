import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { relatoriosService, RelatorioMatriculaAcademicaItem, RelatorioModalidade, RelatorioTurmaOption } from '../relatorios.service';
import {
  A4ReportShell,
  EmptyReportState,
  FilterField,
  FilterSelect,
  formatDate,
  MODALIDADE_LABELS,
  ReportFilterPanel,
  ReportKpiCard,
  ReportMetaCard,
  STATUS_LABELS,
  SummaryCard,
} from './RelatorioShared';
import { paginateReportItems } from './report-pagination';

export type RelatorioAlunosAcademicosModo = 'cursando' | 'finalizados' | 'matricula-inicial' | 'situacao-aluno';

interface RelatorioAlunosAcademicosProps {
  company: any;
  polo: any;
  modo: RelatorioAlunosAcademicosModo;
}

const modeConfig = {
  cursando: {
    title: 'Relatório de Alunos Cursando',
    rightTitle: 'Controle Acadêmico',
    rightType: 'Alunos Cursando',
    description: 'Relação de alunos ativos/em curso separados por modalidade, curso, turma e polo, com dados de vínculo acadêmico e identificação da matrícula.',
    defaultStatus: 'ATIVO',
  },
  finalizados: {
    title: 'Relatório de Alunos Finalizados / Concluintes',
    rightTitle: 'Conclusão Acadêmica',
    rightType: 'Alunos Finalizados',
    description: 'Relação de alunos com curso concluído, carga horária, turma, certificado vinculado e situação de emissão documental.',
    defaultStatus: 'CONCLUIDO',
  },
  'matricula-inicial': {
    title: 'Relatório de Matrícula Inicial',
    rightTitle: 'Base Censo Escolar',
    rightType: 'Matrícula Inicial',
    description: 'Listagem acadêmica inspirada na coleta de Matrícula Inicial do Censo Escolar, contendo escola/polo, turma, aluno, curso, turno/modalidade e dados cadastrais essenciais.',
    defaultStatus: 'todos',
  },
  'situacao-aluno': {
    title: 'Relatório de Situação do Aluno',
    rightTitle: 'Movimento e Rendimento',
    rightType: 'Situação do Aluno',
    description: 'Consolidação da situação acadêmica por matrícula: cursando, concluído, transferido, desistente, trancado ou cancelado, apoiando controles internos e levantamentos oficiais.',
    defaultStatus: 'todos',
  },
} as const;

const academicStatuses = ['todos', 'ATIVO', 'CONCLUIDO', 'TRANCADO', 'CANCELADO', 'DESISTENTE', 'TRANSFERIDO'];

const isCursando = (status: string) => ['ATIVO', 'CONFIRMADO', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO'].includes(String(status).toUpperCase());
const isFinalizado = (status: string) => String(status).toUpperCase() === 'CONCLUIDO';
const maskCpf = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || '-';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
};

const relatoriosAcademicosKeys = {
  turmas: (modalidade: RelatorioModalidade, poloId?: string) =>
    ['relatorios', 'turmas-academicas', modalidade, poloId || 'todos'] as const,
  matriculas: (filters: {
    modalidade: RelatorioModalidade;
    turmaId: string;
    poloId?: string;
    status?: string;
  }) => ['relatorios', 'matriculas-academicas', filters] as const,
};

const RelatorioAlunosAcademicos: React.FC<RelatorioAlunosAcademicosProps> = ({ company, polo, modo }) => {
  const config = modeConfig[modo];
  const [modalidade, setModalidade] = useState<RelatorioModalidade>('todos');
  const [turmaId, setTurmaId] = useState('todos');
  const [status, setStatus] = useState(config.defaultStatus);
  const [showFullCpf, setShowFullCpf] = useState(false);

  const poloId = polo?.id;
  const reportFilters = {
    modalidade,
    turmaId,
    poloId,
    status: status === 'todos' ? undefined : status,
  };
  const turmasQuery = useQuery<RelatorioTurmaOption[]>({
    queryKey: relatoriosAcademicosKeys.turmas(modalidade, poloId),
    queryFn: () => relatoriosService.getTurmasOptions(modalidade, poloId),
    staleTime: 5 * 60_000,
  });
  const matriculasQuery = useQuery<RelatorioMatriculaAcademicaItem[]>({
    queryKey: relatoriosAcademicosKeys.matriculas(reportFilters),
    queryFn: () => relatoriosService.getMatriculasAcademicas(reportFilters),
    staleTime: 30_000,
  });
  const turmas = turmasQuery.data || [];
  const items = matriculasQuery.data || [];
  const loading = matriculasQuery.isLoading || turmasQuery.isLoading;
  const hasQueryError = matriculasQuery.isError || turmasQuery.isError;

  useEffect(() => {
    setStatus(config.defaultStatus);
  }, [config.defaultStatus, modo]);

  useEffect(() => {
    if (turmaId !== 'todos' && turmasQuery.isSuccess && !turmas.some(row => row.id === turmaId)) {
      setTurmaId('todos');
    }
  }, [turmaId, turmas, turmasQuery.isSuccess]);

  const filteredItems = useMemo(() => {
    if (modo === 'cursando') return items.filter(item => isCursando(item.status));
    if (modo === 'finalizados') return items.filter(item => isFinalizado(item.status));
    return items;
  }, [items, modo]);

  const totals = useMemo(() => {
    const byStatus = filteredItems.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status || 'SEM_STATUS').toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const byModalidade = filteredItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.modalidade] = (acc[item.modalidade] || 0) + 1;
      return acc;
    }, {});
    const certificados = filteredItems.filter(item => item.certificadoStatus === 'FINALIZADO').length;
    return { byStatus, byModalidade, certificados };
  }, [filteredItems]);
  const itemPages = useMemo(
    () => paginateReportItems(filteredItems, 8, 14),
    [filteredItems],
  );

  const renderTable = (pageItems: RelatorioMatriculaAcademicaItem[]) => {
    if (hasQueryError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center">
          <p className="text-sm font-bold text-red-700">Não foi possível carregar o relatório acadêmico.</p>
          <button
            type="button"
            onClick={() => void Promise.all([matriculasQuery.refetch(), turmasQuery.refetch()])}
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-[10px] font-black uppercase text-white"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    if (pageItems.length === 0) return <EmptyReportState />;

    if (modo === 'matricula-inicial') {
      return (
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Matrículas iniciais por aluno, curso, turma, modalidade e polo</caption>
          <thead>
            <tr className="border-b-2 border-slate-300 text-[8px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
              <th scope="col" className="py-2 px-2">Aluno</th>
              <th scope="col" className="py-2 px-2">Nascimento</th>
              <th scope="col" className="py-2 px-2">Curso/Turma</th>
              <th scope="col" className="py-2 px-2">Modalidade</th>
              <th scope="col" className="py-2 px-2">Polo</th>
              <th scope="col" className="py-2 px-2">PCD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((item) => (
              <tr key={item.id} className="h-12 text-[9px] text-slate-700">
                <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-black text-[#001a33]" title={item.alunoNome}>{item.alunoNome}</p><p className="text-[8px] text-slate-400">CPF {showFullCpf ? item.alunoCpf : maskCpf(item.alunoCpf)}</p></td>
                <td className="py-2 px-2">{formatDate(item.dataNascimento)}</td>
                <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-bold" title={item.cursoNome}>{item.cursoNome}</p><p className="truncate text-[8px] text-slate-400" title={item.turmaNome}>{item.turmaNome}</p></td>
                <td className="py-2 px-2">{MODALIDADE_LABELS[item.modalidade] || item.modalidade}</td>
                <td className="truncate px-2 py-2" title={item.poloNome}>{item.poloNome}</td>
                <td className="py-2 px-2">{item.pcd ? (item.pcdTipo || 'Sim') : 'Não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (modo === 'situacao-aluno') {
      return (
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Situação acadêmica dos alunos</caption>
          <thead>
            <tr className="border-b-2 border-slate-300 text-[8px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
              <th scope="col" className="py-2 px-2">Aluno</th>
              <th scope="col" className="py-2 px-2">Curso/Turma</th>
              <th scope="col" className="py-2 px-2">Entrada</th>
              <th scope="col" className="py-2 px-2">Situação</th>
              <th scope="col" className="py-2 px-2">Modalidade</th>
              <th scope="col" className="py-2 px-2">Polo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((item) => (
              <tr key={item.id} className="h-12 text-[9px] text-slate-700">
                <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-black text-[#001a33]" title={item.alunoNome}>{item.alunoNome}</p><p className="text-[8px] text-slate-400">{showFullCpf ? item.alunoCpf : maskCpf(item.alunoCpf)}</p></td>
                <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-bold" title={item.cursoNome}>{item.cursoNome}</p><p className="truncate text-[8px] text-slate-400" title={item.turmaNome}>{item.turmaNome}</p></td>
                <td className="py-2 px-2">{formatDate(item.dataMatricula)}</td>
                <td className="py-2 px-2"><span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[8px] font-black uppercase">{STATUS_LABELS[item.status] || item.status}</span></td>
                <td className="py-2 px-2">{MODALIDADE_LABELS[item.modalidade] || item.modalidade}</td>
                <td className="truncate px-2 py-2" title={item.poloNome}>{item.poloNome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Alunos, cursos, períodos, carga horária e certificados</caption>
        <thead>
          <tr className="border-b-2 border-slate-300 text-[8px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
            <th scope="col" className="py-2 px-2">Aluno</th>
            <th scope="col" className="py-2 px-2">Curso/Turma</th>
            <th scope="col" className="py-2 px-2">Modalidade</th>
            <th scope="col" className="py-2 px-2">Período</th>
            <th scope="col" className="py-2 px-2">Carga</th>
            <th scope="col" className="py-2 px-2">Certificado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pageItems.map((item) => (
            <tr key={item.id} className="h-12 text-[9px] text-slate-700">
              <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-black text-[#001a33]" title={item.alunoNome}>{item.alunoNome}</p><p className="text-[8px] text-slate-400">{showFullCpf ? item.alunoCpf : maskCpf(item.alunoCpf)}</p></td>
              <td className="overflow-hidden px-2 py-1.5"><p className="truncate font-bold" title={item.cursoNome}>{item.cursoNome}</p><p className="truncate text-[8px] text-slate-400" title={item.turmaNome}>{item.turmaNome}</p></td>
              <td className="py-2 px-2">{MODALIDADE_LABELS[item.modalidade] || item.modalidade}</td>
              <td className="py-2 px-2">{formatDate(item.dataInicio)} a {formatDate(item.dataFim)}</td>
              <td className="py-2 px-2">{item.cargaHoraria}h</td>
              <td className="py-2 px-2">
                {item.certificadoStatus ? (
                  <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${item.certificadoStatus === 'FINALIZADO' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.certificadoStatus}</span>
                ) : <span className="text-slate-400">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-auto lg:flex-row lg:overflow-hidden">
      <ReportFilterPanel
        printDisabled={matriculasQuery.isFetching || turmasQuery.isFetching || hasQueryError}
        summary={
          <>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Acadêmico</h4>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Registros" value={filteredItems.length} tone="blue" />
              <SummaryCard label="Técnico" value={totals.byModalidade.TECNICO || 0} />
              <SummaryCard label="EAD" value={totals.byModalidade.EAD || 0} />
              <SummaryCard label="Certificados" value={totals.certificados} tone="emerald" />
            </div>
          </>
        }
      >
        <FilterField label="Modalidade">
          <FilterSelect value={modalidade} onChange={(e) => setModalidade(e.target.value as RelatorioModalidade)}>
            {Object.entries(MODALIDADE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="Turma">
          <FilterSelect value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
            <option value="todos">Todas as turmas</option>
            {turmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome} {turma.codigo ? `(${turma.codigo})` : ''}</option>)}
          </FilterSelect>
        </FilterField>
        {modo !== 'cursando' && modo !== 'finalizados' && (
          <FilterField label="Situação acadêmica">
            <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {academicStatuses.map((key) => <option key={key} value={key}>{STATUS_LABELS[key] || key}</option>)}
            </FilterSelect>
          </FilterField>
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase text-slate-600">
          <input type="checkbox" checked={showFullCpf} onChange={(event) => setShowFullCpf(event.target.checked)} />
          Exibir CPF completo
        </label>
      </ReportFilterPanel>

      <A4ReportShell
        company={company}
        polo={polo}
        loading={loading}
        rightTitle={config.rightTitle}
        rightType={config.rightType}
        title={config.title}
        description={config.description}
        meta={
          <>
            <ReportMetaCard label="Modalidade" value={MODALIDADE_LABELS[modalidade]} />
            <ReportMetaCard label="Situação" value={modo === 'cursando' ? 'Cursando' : modo === 'finalizados' ? 'Concluído' : STATUS_LABELS[status] || status} />
            <ReportMetaCard label="Unidade / Polo" value={polo?.nome || 'Todos os polos autorizados'} />
          </>
        }
        kpis={
          <>
            <ReportKpiCard label="Total" value={filteredItems.length} tone="blue" />
            <ReportKpiCard label="Cursando" value={totals.byStatus.ATIVO || 0} tone="emerald" />
            <ReportKpiCard label="Concluídos" value={totals.byStatus.CONCLUIDO || 0} tone="amber" />
          </>
        }
        pages={itemPages.map((pageItems) => renderTable(pageItems))}
      />
    </div>
  );
};

export default RelatorioAlunosAcademicos;
