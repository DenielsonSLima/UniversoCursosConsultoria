import './financeiro-summary.css';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { getCurrentCaixaCompetencia } from '../../caixa/caixa.service';
import { caixaWorkspaceScopeQueryOptions } from '../../caixa/workspace/caixa-workspace-scope.queries';
import { CaixaWorkspaceView } from '../../caixa/workspace/components/CaixaWorkspaceView';
import type { FinanceiroTabId } from '../../access-control';
import ResumoTab from './ResumoTab';

interface FinanceiroResumoTabProps {
  poloId?: string | null;
  poloName?: string;
  availableTabs: FinanceiroTabId[];
  onNavigate: (tab: FinanceiroTabId) => void;
}

const TreasuryLoading = () => (
  <section
    role="status"
    aria-busy="true"
    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
  >
    <span className="sr-only">Preparando a visão de tesouraria.</span>
    <div className="h-14 animate-pulse border-b border-slate-100 bg-slate-50" />
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  </section>
);

const TreasuryUnavailable = ({ message }: { message: string }) => (
  <section role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
    <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" size={18} />
    <div>
      <h2 className="text-sm font-medium">Visão de tesouraria indisponível</h2>
      <p className="mt-1 text-xs font-normal leading-5 text-amber-800">{message}</p>
    </div>
  </section>
);

const FinanceiroResumoTab: React.FC<FinanceiroResumoTabProps> = ({
  poloId,
  poloName,
  availableTabs,
  onNavigate,
}) => {
  const canViewPayables = availableTabs.includes('despesas');
  const selectedPoloId = poloId && poloId !== 'todos' ? poloId : '';
  const scopeQuery = useQuery({
    ...caixaWorkspaceScopeQueryOptions(selectedPoloId),
    enabled: canViewPayables && Boolean(selectedPoloId),
  });

  return (
    <div className="financeiro-overview space-y-5">
      {canViewPayables ? (
        <div className="financeiro-treasury">
        {!selectedPoloId ? (
          <TreasuryUnavailable message="Selecione um polo para consultar compromissos e vencimentos." />
        ) : scopeQuery.isPending ? (
          <TreasuryLoading />
        ) : scopeQuery.isError || !scopeQuery.data ? (
          <TreasuryUnavailable message="Não foi possível identificar a empresa vinculada ao polo selecionado." />
        ) : (
          <CaixaWorkspaceView
            empresaId={scopeQuery.data.empresaId}
            poloId={selectedPoloId}
            competencia={getCurrentCaixaCompetencia()}
            scopeLabel={poloName || 'Polo selecionado'}
            companyPoloIds={scopeQuery.data.poloIds}
          />
        )}
        </div>
      ) : null}

      <ResumoTab
        poloId={poloId}
        availableTabs={availableTabs}
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default FinanceiroResumoTab;
