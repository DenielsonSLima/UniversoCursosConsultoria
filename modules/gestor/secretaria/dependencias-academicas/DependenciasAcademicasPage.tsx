import {
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DependenciaEncaminhamentoWizard from './components/DependenciaEncaminhamentoWizard';
import DependenciasFinancialRules from './components/DependenciasFinancialRules';
import DependenciasKpis from './components/DependenciasKpis';
import DependenciasTable from './components/DependenciasTable';
import DependenciaBoletoPanel from './components/DependenciaBoletoPanel';
import { useDependenciasAcademicasRealtime } from './hooks/useDependenciasAcademicasRealtime';
import {
  useConfigurarPoliticaDependenciaMutation,
  useEmitirBoletoDependenciaMutation,
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

const DependenciasAcademicasPage = ({ poloId }: DependenciasAcademicasPageProps) => {
  const activePoloId = poloId || '';
  const [activeTab, setActiveTab] = useState<DependenciaWorkspaceTab>('pendentes');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DependenciaAcademica | null>(null);
  const [activeBoleto, setActiveBoleto] = useState<DependenciaBoleto | null>(null);
  const workspaceQuery = useDependenciasWorkspaceQuery(activePoloId);
  const policyMutation = useConfigurarPoliticaDependenciaMutation(activePoloId);
  const boletoMutation = useEmitirBoletoDependenciaMutation(activePoloId);
  useDependenciasAcademicasRealtime(activePoloId);

  useEffect(() => {
    setSelected(null);
    setActiveBoleto(null);
  }, [activePoloId]);

  const workspace = workspaceQuery.data;
  const boletoPendingId = boletoMutation.isPending
    ? boletoMutation.variables?.recebivelId || null
    : null;
  const visibleItems = useMemo(() => {
    const byTab = filterByTab(workspace?.dependencias || [], activeTab);
    return byTab.filter((item) => matchesDependenciaSearch(item, search));
  }, [activeTab, search, workspace?.dependencias]);

  const counts = useMemo(() => ({
    pendentes: filterByTab(workspace?.dependencias || [], 'pendentes').length,
    programadas: filterByTab(workspace?.dependencias || [], 'programadas').length,
    encerradas: filterByTab(workspace?.dependencias || [], 'encerradas').length,
    regras: workspace?.regrasFinanceiras.length || 0,
  }), [workspace]);

  const openOrEmitBoleto = (item: DependenciaAcademica) => {
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
  };

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
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[#001a33] text-white shadow-lg">
        <div className="relative p-6 sm:p-7">
          <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full border-[28px] border-cyan-400/10" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">
                <BookOpenCheck size={12} /> Gestão por disciplina
              </span>
              <h3 className="mt-4 text-2xl font-black uppercase tracking-tight sm:text-3xl">Dependências acadêmicas</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                Encaminhe reprovações para uma nova oferta, gere a cobrança Banese e acompanhe a entrada exclusiva no diário da disciplina.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void workspaceQuery.refetch()}
              disabled={workspaceQuery.isFetching}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-white/15 disabled:opacity-50 sm:w-auto"
            >
              <RefreshCw size={14} className={workspaceQuery.isFetching ? 'animate-spin' : ''} />
              Atualizar workspace
            </button>
          </div>
        </div>
      </div>

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

      <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-4 text-[10px] font-black uppercase tracking-wider transition ${
                  active
                    ? 'bg-[#001a33] text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-blue-700'
                }`}
              >
                <Icon size={14} />
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab !== 'regras' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">
              {tabs.find((tab) => tab.id === activeTab)?.label}
            </h4>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {visibleItems.length} registro(s) no filtro atual.
            </p>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar aluno, curso ou disciplina"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
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
        />
      ) : (
        <DependenciasTable
          items={visibleItems}
          mode={activeTab}
          onEncaminhar={setSelected}
          onBoleto={openOrEmitBoleto}
          boletoPendingId={boletoPendingId}
        />
      )}

      <DependenciaEncaminhamentoWizard
        poloId={activePoloId}
        dependencia={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
};

export default DependenciasAcademicasPage;
