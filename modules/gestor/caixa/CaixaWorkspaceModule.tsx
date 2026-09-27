import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, LayoutDashboard } from 'lucide-react';
import CaixaPage from './CaixaPage.tsx';
import { getCurrentCaixaCompetencia } from './caixa.service.ts';
import { caixaWorkspaceScopeQueryOptions } from './workspace/caixa-workspace-scope.queries.ts';
import { CaixaWorkspaceView } from './workspace/components/CaixaWorkspaceView.tsx';

interface CaixaWorkspaceModuleProps {
  poloId?: string | null;
  poloName?: string;
  isGlobal?: boolean;
  isMatriz?: boolean;
}

const ScopeLoading = () => (
  <section role="status" aria-busy="true" className="mb-6 h-72 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100">
    <span className="sr-only">Preparando mesa de tesouraria.</span>
  </section>
);

export const CaixaWorkspaceModule = (props: CaixaWorkspaceModuleProps) => {
  const [mode, setMode] = useState<'workspace' | 'monthly'>('workspace');
  const poloId = props.poloId ?? '';
  const scopeQuery = useQuery({
    ...caixaWorkspaceScopeQueryOptions(poloId),
    enabled: mode === 'workspace' && Boolean(poloId),
  });
  // O painel mensal legado ainda não recebe company_id em suas RPCs. Durante
  // este cutover os dois painéis permanecem presos ao polo externo selecionado,
  // evitando misturar consolidado do sistema com o Workspace por empresa.
  const workspacePoloId = poloId;

  return (
    <div className="space-y-6">
      <nav aria-label="Visão do Caixa" className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMode('workspace')}
          aria-pressed={mode === 'workspace'}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-[0.1em] transition ${mode === 'workspace' ? 'bg-[#001a33] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
        >
          <LayoutDashboard aria-hidden="true" size={15} /> Cockpit de tesouraria
        </button>
        <button
          type="button"
          onClick={() => setMode('monthly')}
          aria-pressed={mode === 'monthly'}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-[0.1em] transition ${mode === 'monthly' ? 'bg-[#001a33] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
        >
          <BarChart3 aria-hidden="true" size={15} /> Análise mensal
        </button>
      </nav>

      {mode === 'monthly' ? (
        <CaixaPage {...props} isGlobal={false} isMatriz={false} />
      ) : !poloId ? (
        <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
          Selecione um polo para abrir a mesa de tesouraria.
        </section>
      ) : scopeQuery.isPending ? (
        <ScopeLoading />
      ) : scopeQuery.isError || !scopeQuery.data ? (
        <section role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-rose-600" size={18} />
          <div>
            <h2 className="text-sm font-extrabold">Mesa de tesouraria indisponível</h2>
            <p className="mt-1 text-xs leading-5">Não foi possível identificar a empresa deste polo. Tente novamente ou abra a análise mensal.</p>
          </div>
        </section>
      ) : (
        <CaixaWorkspaceView
          empresaId={scopeQuery.data.empresaId}
          poloId={workspacePoloId}
          competencia={getCurrentCaixaCompetencia()}
          scopeLabel={props.poloName || 'Polo atual'}
          companyPoloIds={scopeQuery.data.poloIds}
        />
      )}
    </div>
  );
};

export default CaixaWorkspaceModule;
