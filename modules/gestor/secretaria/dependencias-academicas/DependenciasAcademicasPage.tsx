import {
  BookOpenCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Scale,
  School,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DependenciaEncaminhamentoWizard from './components/DependenciaEncaminhamentoWizard';
import DependenciasFinancialRules from './components/DependenciasFinancialRules';
import DependenciasKpis from './components/DependenciasKpis';
import DependenciasTable from './components/DependenciasTable';
import DependenciasFilters, {
  type DependenciasViewMode,
} from './components/DependenciasFilters';
import DependenciaBoletoPanel from './components/DependenciaBoletoPanel';
import FinancialUnderlineTabs from '../../financeiro/components/FinancialUnderlineTabs';
import { useDependenciasAcademicasRealtime } from './hooks/useDependenciasAcademicasRealtime';
import {
  useConfigurarPoliticaDependenciaMutation,
  useEmitirBoletoDependenciaMutation,
  useRemoverPoliticaDependenciaMutation,
} from './hooks/useDependenciasAcademicasMutations';
import { useDependenciasWorkspaceQuery } from './hooks/useDependenciasAcademicasQueries';
import type {
  DependenciaAcademica,
  DependenciaBoleto,
  DependenciaWorkspaceTab,
} from './dependencias-academicas.types';
import { hasCompleteDependencyBoleto } from './dependencias-academicas.finance';
import {
  filterByTab,
  matchesDependenciaSearch,
} from './dependencias-academicas.utils';

interface DependenciasAcademicasPageProps {
  poloId?: string | null;
}

const tabs: Array<{
  id: DependenciaWorkspaceTab;
  label: string;
  shortLabel: string;
  icon: typeof BookOpenCheck;
}> = [
  { id: 'pendentes', label: 'Pendentes', shortLabel: 'Pendentes', icon: BookOpenCheck },
  { id: 'programadas', label: 'Programadas e em curso', shortLabel: 'Em curso', icon: CalendarRange },
  { id: 'encerradas', label: 'Encerradas', shortLabel: 'Encerradas', icon: CheckCircle2 },
  { id: 'regras', label: 'Regras financeiras', shortLabel: 'Regras', icon: Scale },
];

const STUDENTS_PER_PAGE = 8;

const DependenciasAcademicasPage = ({ poloId }: DependenciasAcademicasPageProps) => {
  const activePoloId = poloId || '';
  const [activeTab, setActiveTab] = useState<DependenciaWorkspaceTab>('pendentes');
  const [search, setSearch] = useState('');
  const [modalidadeFilter, setModalidadeFilter] = useState('');
  const [cursoFilter, setCursoFilter] = useState('');
  const [turmaFilter, setTurmaFilter] = useState('');
  const [viewMode, setViewMode] = useState<DependenciasViewMode>('table');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DependenciaAcademica | null>(null);
  const [activeBoleto, setActiveBoleto] = useState<DependenciaBoleto | null>(null);
  const [checkoutAfterReversalId, setCheckoutAfterReversalId] = useState<string | null>(() => (
    typeof window === 'undefined'
      ? null
      : window.sessionStorage.getItem('dependencia:checkout-after-reversal')
  ));
  const workspaceQuery = useDependenciasWorkspaceQuery(activePoloId);
  const policyMutation = useConfigurarPoliticaDependenciaMutation(activePoloId);
  const removePolicyMutation = useRemoverPoliticaDependenciaMutation(activePoloId);
  const boletoMutation = useEmitirBoletoDependenciaMutation(activePoloId);
  useDependenciasAcademicasRealtime(activePoloId);
  const openOrEmitBoleto = useCallback((item: DependenciaAcademica) => {
    if (hasCompleteDependencyBoleto(item.boleto)) {
      setActiveBoleto(item.boleto);
      return;
    }
    const recebivelId = item.boleto.recebivelId || item.cobrancaId;
    if (!recebivelId || !item.tentativaId) return;
    boletoMutation.mutate({
      tentativaId: item.tentativaId,
      cobrancaId: item.cobrancaId,
      recebivelId,
      turmaId: item.turmaDestinoId,
      disciplinaId: item.disciplinaId,
      status: item.status,
    }, {
      onSuccess: (result) => setActiveBoleto(result.boleto),
    });
  }, [boletoMutation]);

  useEffect(() => {
    setSelected(null);
    setActiveBoleto(null);
    setSearch('');
    setModalidadeFilter('');
    setCursoFilter('');
    setTurmaFilter('');
    setPage(1);
  }, [activePoloId]);

  const workspace = workspaceQuery.data;
  useEffect(() => {
    if (!checkoutAfterReversalId || !workspace?.dependencias.length) return;
    const item = workspace.dependencias.find((candidate) => (
      (candidate.boleto.recebivelId || candidate.cobrancaId) === checkoutAfterReversalId
    ));
    if (!item?.tentativaId) return;
    window.sessionStorage.removeItem('dependencia:checkout-after-reversal');
    setCheckoutAfterReversalId(null);
    openOrEmitBoleto(item);
  }, [checkoutAfterReversalId, openOrEmitBoleto, workspace?.dependencias]);
  const boletoPendingId = boletoMutation.isPending
    ? boletoMutation.variables?.recebivelId || null
    : null;
  const tabItems = useMemo(
    () => filterByTab(workspace?.dependencias || [], activeTab),
    [activeTab, workspace?.dependencias],
  );
  const modalidadeOptions = useMemo(() => (
    [...new Set<string>(tabItems.map((item) => item.modalidade).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((value) => ({
        value,
        label: value === 'TECNICO' || value === 'TÉCNICO'
          ? 'Técnico'
          : value.replaceAll('_', ' '),
      }))
  ), [tabItems]);
  const courseOptions = useMemo(() => (
    [...new Set<string>(
      tabItems
        .filter((item) => !modalidadeFilter || item.modalidade === modalidadeFilter)
        .map((item) => item.cursoNome)
        .filter(Boolean),
    )]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((value) => ({ value, label: value }))
  ), [modalidadeFilter, tabItems]);
  const turmaOptions = useMemo(() => {
    const byId = new Map<string, string>();
    tabItems
      .filter((item) => !modalidadeFilter || item.modalidade === modalidadeFilter)
      .filter((item) => !cursoFilter || item.cursoNome === cursoFilter)
      .forEach((item) => {
        const id = item.turmaOrigemId
          || item.turmaOrigemCodigo
          || item.turmaOrigemNome;
        byId.set(
          id,
          [item.turmaOrigemCodigo, item.turmaOrigemNome]
            .filter(Boolean)
            .filter((value, index, values) => values.indexOf(value) === index)
            .join(' · '),
        );
      });
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [cursoFilter, modalidadeFilter, tabItems]);
  const visibleItems = useMemo(() => {
    return tabItems
      .filter((item) => !modalidadeFilter || item.modalidade === modalidadeFilter)
      .filter((item) => !cursoFilter || item.cursoNome === cursoFilter)
      .filter((item) => (
        !turmaFilter
        || (item.turmaOrigemId || item.turmaOrigemCodigo || item.turmaOrigemNome)
          === turmaFilter
      ))
      .filter((item) => matchesDependenciaSearch(item, search));
  }, [
    cursoFilter,
    modalidadeFilter,
    search,
    tabItems,
    turmaFilter,
  ]);
  const studentUnits = useMemo(() => {
    const byStudent = new Map<string, DependenciaAcademica[]>();
    visibleItems.forEach((item) => {
      const turmaKey = item.turmaOrigemId
        || item.turmaOrigemCodigo
        || item.turmaOrigemNome;
      const studentKey = item.alunoId || item.matriculaId || item.alunoNome;
      const key = `${turmaKey}:${studentKey}`;
      const current = byStudent.get(key) || [];
      current.push(item);
      byStudent.set(key, current);
    });
    return [...byStudent.entries()]
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => {
        const turmaA = a.items[0]?.turmaOrigemCodigo
          || a.items[0]?.turmaOrigemNome
          || '';
        const turmaB = b.items[0]?.turmaOrigemCodigo
          || b.items[0]?.turmaOrigemNome
          || '';
        const turmaOrder = turmaA.localeCompare(turmaB, 'pt-BR');
        if (turmaOrder !== 0) return turmaOrder;
        return (a.items[0]?.alunoNome || '').localeCompare(
          b.items[0]?.alunoNome || '',
          'pt-BR',
        );
      });
  }, [visibleItems]);
  const totalPages = Math.max(
    1,
    Math.ceil(studentUnits.length / STUDENTS_PER_PAGE),
  );
  const paginatedItems = useMemo(
    () => studentUnits
      .slice((page - 1) * STUDENTS_PER_PAGE, page * STUDENTS_PER_PAGE)
      .flatMap((unit) => unit.items),
    [page, studentUnits],
  );
  const groupedItems = useMemo(() => {
    const byTurma = new Map<string, DependenciaAcademica[]>();
    paginatedItems.forEach((item) => {
      const key = item.turmaOrigemId
        || item.turmaOrigemCodigo
        || item.turmaOrigemNome;
      const current = byTurma.get(key) || [];
      current.push(item);
      byTurma.set(key, current);
    });
    return [...byTurma.entries()]
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => (
        (a.items[0]?.turmaOrigemCodigo || a.items[0]?.turmaOrigemNome || '')
          .localeCompare(
            b.items[0]?.turmaOrigemCodigo || b.items[0]?.turmaOrigemNome || '',
            'pt-BR',
          )
      ));
  }, [paginatedItems]);
  const filteredTurmaCount = useMemo(
    () => new Set(
      visibleItems.map((item) => (
        item.turmaOrigemId || item.turmaOrigemCodigo || item.turmaOrigemNome
      )),
    ).size,
    [visibleItems],
  );

  useEffect(() => {
    setPage(1);
  }, [activeTab, cursoFilter, modalidadeFilter, search, turmaFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const counts = useMemo(() => ({
    pendentes: filterByTab(workspace?.dependencias || [], 'pendentes').length,
    programadas: filterByTab(workspace?.dependencias || [], 'programadas').length,
    encerradas: filterByTab(workspace?.dependencias || [], 'encerradas').length,
    regras: workspace?.regrasFinanceiras.length || 0,
  }), [workspace]);
  const tabNavigationItems = tabs.map((tab) => {
    const Icon = tab.icon;
    return {
      id: tab.id,
      label: tab.label,
      icon: <Icon size={14} />,
      badge: counts[tab.id],
      badgeClassName: 'bg-blue-50 text-blue-700',
    };
  });
  const hasFilters = Boolean(
    search || modalidadeFilter || cursoFilter || turmaFilter,
  );

  if (!activePoloId) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
        <ShieldAlert size={30} className="mx-auto text-amber-700" />
        <h3 className="mt-3 text-base font-black uppercase tracking-tight">Selecione um polo</h3>
        <p className="mt-1 text-xs font-semibold">O workspace de dependências é sempre consultado dentro do escopo de um polo autorizado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <DependenciasKpis items={workspace?.dependencias || []} />

      {activeBoleto ? (
        <section className="relative rounded-3xl border border-cyan-200 bg-cyan-50 p-4">
          <button
            type="button"
            onClick={() => setActiveBoleto(null)}
            aria-label="Fechar boleto"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-500 shadow-sm"
          >
            <X size={15} />
          </button>
          <div className="pr-10">
            <DependenciaBoletoPanel boleto={activeBoleto} />
          </div>
        </section>
      ) : null}

      {boletoMutation.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">
          {boletoMutation.error.message}
        </div>
      ) : null}

      <FinancialUnderlineTabs
        items={tabNavigationItems}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Etapas das dependências acadêmicas"
      />

      {activeTab !== 'regras' ? (
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">
              {tabs.find((tab) => tab.id === activeTab)?.label}
            </h4>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {visibleItems.length} resultado(s) de {studentUnits.length} aluno(s)
              {' '}em {filteredTurmaCount} turma(s).
            </p>
          </div>
          <DependenciasFilters
            search={search}
            modalidade={modalidadeFilter}
            curso={cursoFilter}
            turma={turmaFilter}
            modalidades={modalidadeOptions}
            cursos={courseOptions}
            turmas={turmaOptions}
            viewMode={viewMode}
            hasFilters={hasFilters}
            onSearchChange={setSearch}
            onModalidadeChange={(value) => {
              setModalidadeFilter(value);
              setCursoFilter('');
              setTurmaFilter('');
            }}
            onCursoChange={(value) => {
              setCursoFilter(value);
              setTurmaFilter('');
            }}
            onTurmaChange={setTurmaFilter}
            onViewModeChange={setViewMode}
            onClear={() => {
              setSearch('');
              setModalidadeFilter('');
              setCursoFilter('');
              setTurmaFilter('');
            }}
          />
        </div>
      ) : null}

      {workspaceQuery.isLoading ? (
        <div className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-700" />
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">Montando workspace</p>
          </div>
        </div>
      ) : workspaceQuery.isError ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
          <ShieldAlert size={30} className="mx-auto text-rose-600" />
          <h4 className="mt-3 text-sm font-black uppercase tracking-tight text-rose-900">Workspace indisponível</h4>
          <p className="mt-1 text-xs font-semibold text-rose-700">
            {workspaceQuery.error instanceof Error ? workspaceQuery.error.message : 'Não foi possível consultar as dependências.'}
          </p>
          <button type="button" onClick={() => void workspaceQuery.refetch()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white">Tentar novamente</button>
        </div>
      ) : activeTab === 'regras' ? (
        <DependenciasFinancialRules
          poloId={activePoloId}
          rules={workspace?.regrasFinanceiras || []}
          disciplines={workspace?.disciplinasConfiguraveis || []}
          mutation={policyMutation}
          removeMutation={removePolicyMutation}
        />
      ) : (
        groupedItems.length ? (
          <div className="space-y-7">
            {groupedItems.map((group) => {
              const first = group.items[0];
              return (
                <section key={group.key} className="space-y-3">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                        <School size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-blue-600">
                          {first.modalidade === 'TECNICO' || first.modalidade === 'TÉCNICO'
                            ? 'Curso técnico'
                            : first.modalidade.replaceAll('_', ' ')}
                        </p>
                        <h5 className="truncate text-sm font-black text-[#001a33]">
                          {first.turmaOrigemCodigo || first.turmaOrigemNome}
                        </h5>
                        <p className="truncate text-[11px] font-semibold text-slate-500">
                          {first.cursoNome}
                          {first.turmaOrigemCodigo && first.turmaOrigemNome
                            ? ` · ${first.turmaOrigemNome}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
                      {group.items.length} resultado(s)
                    </span>
                  </header>
                  <DependenciasTable
                    items={group.items}
                    mode={activeTab}
                    onEncaminhar={setSelected}
                    onBoleto={openOrEmitBoleto}
                    boletoPendingId={boletoPendingId}
                    viewMode={viewMode}
                  />
                </section>
              );
            })}
          </div>
        ) : (
          <DependenciasTable
            items={[]}
            mode={activeTab}
            onEncaminhar={setSelected}
            onBoleto={openOrEmitBoleto}
            boletoPendingId={boletoPendingId}
            viewMode={viewMode}
          />
        )
      )}

      {activeTab !== 'regras' && studentUnits.length > STUDENTS_PER_PAGE ? (
        <nav
          aria-label="Paginação das dependências"
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-[11px] font-semibold text-slate-500">
            Página <strong className="text-[#001a33]">{page}</strong> de{' '}
            <strong className="text-[#001a33]">{totalPages}</strong>
            {' '}· até {STUDENTS_PER_PAGE} alunos por página
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Página anterior"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                aria-label={`Página ${pageNumber}`}
                aria-current={page === pageNumber ? 'page' : undefined}
                className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-[11px] font-extrabold transition ${
                  page === pageNumber
                    ? 'bg-[#001a33] text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-600'
                }`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              aria-label="Próxima página"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </nav>
      ) : null}

      <DependenciaEncaminhamentoWizard
        poloId={activePoloId}
        dependencia={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
};

export default DependenciasAcademicasPage;
