import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { caixaWorkspaceV2QueryOptions } from '../caixa-workspace.queries.ts';
import { useCaixaWorkspaceRealtime } from '../useCaixaWorkspaceRealtime.ts';
import { CaixaWorkspacePrototype } from './CaixaWorkspacePrototype.tsx';
import { CaixaWorkspacePayablesModal } from './CaixaWorkspacePayablesModal.tsx';
import type { CaixaWorkspacePayablesFilter } from '../caixa-workspace-payables.types.ts';

const WORKSPACE_HISTORY_MONTHS = 6;

export interface CaixaWorkspaceViewProps {
  empresaId: string;
  poloId: 'todos' | string;
  competencia: string;
  scopeLabel: string;
  companyPoloIds: readonly string[];
}

const PAYABLES_TITLES: Record<CaixaWorkspacePayablesFilter, string> = {
  ATRASADAS: 'Contas em atraso',
  HOJE: 'Vencimentos de hoje',
  PROXIMOS_7_DIAS: 'Vencimentos dos próximos sete dias',
  COMPETENCIA: 'Contas da competência',
  PAGAS_COMPETENCIA: 'Pagamentos realizados na competência',
  A_VENCER_COMPETENCIA: 'Contas a vencer na competência',
};

const CaixaWorkspaceSkeleton = () => (
  <section
    role="status"
    aria-busy="true"
    aria-label="Carregando mesa de tesouraria"
    className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
  >
    <span className="sr-only">Carregando dados do Caixa para o escopo selecionado.</span>
    <div className="flex min-h-[78px] items-center justify-between gap-5 border-b border-slate-200 px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-2 motion-safe:animate-pulse">
        <div className="h-3 w-28 rounded-full bg-slate-200" />
        <div className="h-4 w-40 rounded-full bg-slate-100" />
      </div>
      <div className="hidden gap-3 sm:flex motion-safe:animate-pulse">
        <div className="h-9 w-28 rounded-xl bg-slate-100" />
        <div className="h-9 w-28 rounded-xl bg-slate-100" />
      </div>
    </div>

    <div className="bg-[#001a33] p-4 sm:p-6 lg:p-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="order-2 space-y-5 lg:order-1">
          <div className="space-y-3 motion-safe:animate-pulse">
            <div className="h-3 w-24 rounded-full bg-blue-300/20" />
            <div className="h-8 w-3/4 rounded-xl bg-white/10" />
            <div className="h-4 w-1/2 rounded-full bg-white/[0.07]" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-28 rounded-2xl border border-white/10 bg-white/[0.055] motion-safe:animate-pulse" />
            ))}
          </div>
        </div>
        <div className="order-1 min-h-52 rounded-2xl border border-white/10 bg-white/[0.045] motion-safe:animate-pulse lg:order-2" />
      </div>

      <div className="mt-6 flex gap-2 overflow-hidden sm:grid sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            data-skeleton-agenda-day
            className="h-24 min-w-[136px] rounded-2xl border border-white/10 bg-white/[0.045] motion-safe:animate-pulse sm:min-w-0"
          />
        ))}
      </div>
    </div>

    <div className="grid gap-3 bg-[#f7f9fc] p-4 sm:p-6 md:grid-cols-3 lg:px-8">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-28 rounded-2xl border border-slate-200 bg-slate-100 motion-safe:animate-pulse" />
      ))}
    </div>
  </section>
);

interface CaixaWorkspaceErrorStateProps {
  isRetrying: boolean;
  onRetry: () => void;
}

export const CaixaWorkspaceErrorState = ({
  isRetrying,
  onRetry,
}: CaixaWorkspaceErrorStateProps) => (
  <section
    role="alert"
    aria-labelledby="caixa-workspace-error-title"
    className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-8 text-center text-rose-950 shadow-sm sm:px-8"
  >
    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-white text-rose-600 shadow-sm">
      <AlertTriangle aria-hidden="true" size={21} />
    </span>
    <h2 id="caixa-workspace-error-title" className="mt-4 text-base font-extrabold">
      Mesa de tesouraria indisponível
    </h2>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-rose-800">
      Não foi possível carregar este escopo e competência. Nenhum dado parcial deste workspace foi exibido.
    </p>
    <button
      type="button"
      onClick={onRetry}
      disabled={isRetrying}
      className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
    >
      <RefreshCw aria-hidden="true" size={15} className={isRetrying ? 'motion-safe:animate-spin' : ''} />
      {isRetrying ? 'Tentando novamente…' : 'Tentar novamente'}
    </button>
  </section>
);

export const CaixaWorkspaceView = ({
  empresaId,
  poloId,
  competencia,
  scopeLabel,
  companyPoloIds,
}: CaixaWorkspaceViewProps) => {
  const [activeFilter, setActiveFilter] = useState<CaixaWorkspacePayablesFilter | null>(null);
  const request = useMemo(() => ({
    empresaId,
    poloId,
    competencia,
    mesesHistorico: WORKSPACE_HISTORY_MONTHS,
  }), [competencia, empresaId, poloId]);

  const workspaceQuery = useQuery(caixaWorkspaceV2QueryOptions(request));

  useCaixaWorkspaceRealtime({
    enabled: Boolean(empresaId),
    empresaId,
    companyPoloIds,
  });

  if (workspaceQuery.isPending) return <CaixaWorkspaceSkeleton />;

  if (workspaceQuery.isError || !workspaceQuery.data) {
    return (
      <CaixaWorkspaceErrorState
        isRetrying={workspaceQuery.isFetching}
        onRetry={() => { void workspaceQuery.refetch(); }}
      />
    );
  }

  return (
    <div aria-busy={workspaceQuery.isFetching || undefined}>
      <CaixaWorkspacePrototype
        payload={workspaceQuery.data}
        scopeLabel={scopeLabel}
        onOpenPayables={setActiveFilter}
      />
      <CaixaWorkspacePayablesModal
        open={activeFilter !== null}
        onClose={() => setActiveFilter(null)}
        empresaId={empresaId}
        poloId={poloId}
        competencia={competencia}
        filtro={activeFilter ?? 'COMPETENCIA'}
        title={PAYABLES_TITLES[activeFilter ?? 'COMPETENCIA']}
      />
    </div>
  );
};
