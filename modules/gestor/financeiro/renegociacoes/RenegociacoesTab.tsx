import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { HandCoins, Info, ReceiptText } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import CandidateGroups from './components/CandidateGroups';
import ProposalCards from './components/ProposalCards';
import ProposalDetail from './components/ProposalDetail';
import RenegociacaoWizard from './components/RenegociacaoWizard';
import RenegociacaoFilters from './components/RenegociacaoFilters';
import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
  RenegociacaoViewTabs,
} from './components/RenegociacaoPanels';
import {
  useRenegociacaoCandidates,
  useRenegociacaoProposals,
  useRenegociacaoReadiness,
} from './hooks/useRenegociacoesQueries';
import { useRenegociacoesRealtime } from './hooks/useRenegociacoesRealtime';
import { renegociacaoUnavailableMessage } from './renegociacoes.model';
import type {
  RenegociacaoCandidateGroup,
  RenegociacaoCandidateFilters,
  RenegociacaoLifecycleStatus,
  RenegociacaoProposalSummary,
  RenegociacaoView,
} from './renegociacoes.types';

export interface RenegociacoesTabProps {
  poloId?: string | null;
  isMatriz: boolean;
  onNavigateToReceivables?: (context?: { alunoId?: string; matriculaId?: string }) => void;
}

const RenegociacoesTab: React.FC<RenegociacoesTabProps> = ({ poloId, isMatriz, onNavigateToReceivables }) => {
  const scopedPoloId = poloId && poloId !== 'todos' ? poloId : null;
  const hasScope = Boolean(scopedPoloId || isMatriz);
  const { toasts, removeToast, toast } = useToast();
  const [view, setView] = useState<RenegociacaoView>('A_NEGOCIAR');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<RenegociacaoCandidateFilters>({ courseType: '', turmaId: '' });
  const [ongoingStatus, setOngoingStatus] =
    useState<Exclude<RenegociacaoLifecycleStatus, 'CANCELED'>>('PROPOSED');
  const [wizard, setWizard] = useState<{ group: RenegociacaoCandidateGroup; selectedIds: string[] } | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const workspaceHeadingRef = useRef<globalThis.HTMLHeadingElement>(null);
  const workspaceFocusFrameRef = useRef<number | null>(null);
  const detailOpenedFromWizardRef = useRef(false);

  const readiness = useRenegociacaoReadiness(hasScope ? scopedPoloId : undefined);
  const available = readiness.data?.availability === 'AVAILABLE';
  const rulesReady = readiness.data?.availability === 'AVAILABLE' && readiness.data.rulesReady;
  const candidates = useRenegociacaoCandidates(
    scopedPoloId,
    deferredSearch,
    page,
    hasScope && rulesReady && view === 'A_NEGOCIAR',
    filters,
  );
  const proposalStatus: RenegociacaoLifecycleStatus = view === 'ENCERRADOS' ? 'CANCELED' : ongoingStatus;
  const proposals = useRenegociacaoProposals(
    scopedPoloId,
    proposalStatus,
    deferredSearch,
    page,
    hasScope && available && (view === 'EM_ANDAMENTO' || view === 'ENCERRADOS'),
  );
  useRenegociacoesRealtime(scopedPoloId, hasScope && available);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, view, ongoingStatus, filters]);
  useEffect(() => {
    setFilters({ courseType: '', turmaId: '' });
    setWizard(null);
    setPage(1);
  }, [scopedPoloId]);
  useEffect(
    () => () => {
      if (workspaceFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(workspaceFocusFrameRef.current);
      }
    },
    [],
  );

  const focusWorkspaceHeading = useCallback(() => {
    if (workspaceFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(workspaceFocusFrameRef.current);
    }
    workspaceFocusFrameRef.current = window.requestAnimationFrame(() => {
      workspaceFocusFrameRef.current = null;
      workspaceHeadingRef.current?.focus();
    });
  }, []);

  const changeView = (next: RenegociacaoView) => {
    setView(next);
    setSearch('');
    setPage(1);
    setProposalId(null);
  };

  const saved = (proposal: RenegociacaoProposalSummary, replayed: boolean) => {
    setWizard(null);
    setView('EM_ANDAMENTO');
    setOngoingStatus(proposal.lifecycleStatus === 'DRAFT' ? 'DRAFT' : 'PROPOSED');
    detailOpenedFromWizardRef.current = true;
    setProposalId(proposal.id);
    toast.success(
      replayed ? 'Proposta já salva' : 'Proposta salva',
      'Nenhum título original foi alterado ao salvar. Confira os detalhes para verificar se a efetivação está autorizada.',
    );
  };

  const discarded = () => {
    detailOpenedFromWizardRef.current = false;
    setProposalId(null);
    setView('ENCERRADOS');
    setPage(1);
    toast.success('Proposta descartada', 'O histórico foi preservado e os títulos originais permaneceram inalterados.');
    focusWorkspaceHeading();
  };

  let workspace: React.ReactNode;
  if (!hasScope) {
    workspace = (
      <EmptyPanel
        title="Selecione um polo"
        description="A renegociação é processada no contexto financeiro de uma unidade. Selecione um polo para continuar."
      />
    );
  } else if (readiness.isPending) {
    workspace = <LoadingPanel label="Verificando disponibilidade..." />;
  } else if (readiness.isError) {
    workspace = (
      <ErrorPanel
        error={readiness.error}
        onRetry={() => {
          void readiness.refetch();
        }}
      />
    );
  } else if (readiness.data?.availability === 'NOT_APPLIED') {
    workspace = <Unavailable message={readiness.data.message} />;
  } else if (!rulesReady) {
    const message =
      readiness.data?.availability === 'AVAILABLE'
        ? renegociacaoUnavailableMessage(
            readiness.data.unavailableReasons.saveProposal,
            'As regras de renegociação ainda não estão disponíveis.',
          )
        : 'Renegociações ainda não está disponível neste ambiente.';
    workspace = <Unavailable message={message} />;
  } else if (view === 'EM_ATRASO') {
    workspace = (
      <EmptyPanel
        title="Acompanhamento ainda indisponível"
        description="Acompanhe os acordos efetivados em Em andamento. A classificação automática de inadimplência ainda não está disponível nesta visão."
      />
    );
  } else {
    workspace = (
      <>
        <RenegociacaoFilters
          view={view}
          ongoingStatus={ongoingStatus}
          search={search}
          onStatus={setOngoingStatus}
          onSearch={setSearch}
          filters={filters}
          filterOptions={candidates.data?.filterOptions}
          loading={candidates.isPending}
          error={candidates.isError}
          onFilters={(next) => { setFilters(next); setPage(1); }}
          onRetry={() => { void candidates.refetch(); }}
        />
        {view === 'A_NEGOCIAR' ? (
          <CandidateGroups
            selectionContextKey={JSON.stringify([scopedPoloId, deferredSearch, page, filters.courseType, filters.turmaId])}
            data={candidates.data}
            loading={candidates.isPending}
            error={candidates.error}
            search={deferredSearch}
            onRetry={() => {
              void candidates.refetch();
            }}
            onStart={(group, selectedIds) => setWizard({ group, selectedIds })}
            onPage={setPage}
          />
        ) : (
          <div className="space-y-3">
            {view === 'ENCERRADOS' ? <ClosedScopeNotice /> : null}
            <ProposalCards
              data={proposals.data}
              loading={proposals.isPending}
              error={proposals.error}
              search={deferredSearch}
              onRetry={() => {
                void proposals.refetch();
              }}
              onOpen={(proposal) => {
                detailOpenedFromWizardRef.current = false;
                setProposalId(proposal.id);
              }}
              onPage={setPage}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            <HandCoins size={17} /> Gestão de acordos
          </p>
          <h2
            ref={workspaceHeadingRef}
            tabIndex={-1}
            className="mt-1 text-2xl font-black uppercase tracking-tight text-[#001a33]"
          >
            Renegociações
          </h2>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
            Monte propostas com qualquer combinação de parcelas vencidas ou a vencer, mantendo o cálculo e o histórico
            auditáveis.
          </p>
        </div>
        {onNavigateToReceivables ? (
          <button
            type="button"
            onClick={() => onNavigateToReceivables()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-slate-600 shadow-sm hover:text-blue-700"
          >
            <ReceiptText size={16} /> Ir para A Receber
          </button>
        ) : null}
      </header>

      <RenegociacaoViewTabs value={view} onChange={changeView} />
      <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-600">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          <strong>Escopo inicial:</strong> mensalidades técnicas e de plano único (livres e especialização) com origem
          local/Banese. Proesc, EAD e parcelas com pagamento parcial não entram nesta etapa.
        </p>
      </div>
      <section id={`renegociacoes-${view}-panel`} role="tabpanel" aria-labelledby={`renegociacoes-${view}-tab`}>
        {workspace}
      </section>

      {wizard && readiness.data?.availability === 'AVAILABLE' ? (
        <RenegociacaoWizard
          group={wizard.group}
          initialSelectedIds={wizard.selectedIds}
          canSave={readiness.data.capabilities.saveProposal}
          saveUnavailableReason={renegociacaoUnavailableMessage(readiness.data.unavailableReasons.saveProposal)}
          onClose={() => setWizard(null)}
          onSaved={saved}
        />
      ) : null}

      {proposalId ? (
        <ProposalDetail
          agreementId={proposalId}
          poloId={scopedPoloId}
          onBack={() => {
            const needsFallbackFocus = detailOpenedFromWizardRef.current;
            detailOpenedFromWizardRef.current = false;
            setProposalId(null);
            if (needsFallbackFocus) focusWorkspaceHeading();
          }}
          onDiscarded={discarded}
        />
      ) : null}
    </div>
  );
};

const ClosedScopeNotice = () => (
  <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600">
    <Info size={16} className="shrink-0" />
    <p>
      Nesta etapa, Encerrados reúne propostas descartadas. Acordos honrados serão exibidos quando a ativação estiver
      disponível.
    </p>
  </div>
);

const Unavailable: React.FC<{ message: string }> = ({ message }) => (
  <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-10 text-center">
    <Info size={36} className="mx-auto text-amber-500" />
    <p className="mt-3 text-sm font-black uppercase tracking-wide text-amber-900">Renegociações indisponíveis</p>
    <p className="mx-auto mt-1 max-w-xl text-xs font-medium leading-relaxed text-amber-800">{message}</p>
  </div>
);

export default RenegociacoesTab;
