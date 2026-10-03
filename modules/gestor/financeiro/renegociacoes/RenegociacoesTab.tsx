import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { HandCoins, Info, ReceiptText } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import CandidateGroups from './components/CandidateGroups';
import ProposalCards from './components/ProposalCards';
import ProposalDetail from './components/ProposalDetail';
import RenegociacaoWizard from './components/RenegociacaoWizard';
import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
  RenegociacaoSearch,
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
  const [ongoingStatus, setOngoingStatus] =
    useState<Extract<RenegociacaoLifecycleStatus, 'DRAFT' | 'PROPOSED'>>('PROPOSED');
  const [wizardGroup, setWizardGroup] = useState<RenegociacaoCandidateGroup | null>(null);
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
  }, [deferredSearch, view, ongoingStatus]);
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
    setWizardGroup(null);
    setView('EM_ANDAMENTO');
    setOngoingStatus(proposal.lifecycleStatus === 'DRAFT' ? 'DRAFT' : 'PROPOSED');
    detailOpenedFromWizardRef.current = true;
    setProposalId(proposal.id);
    toast.success(
      replayed ? 'Proposta já salva' : 'Proposta salva',
      'Nenhum título original foi alterado. A ativação permanece indisponível nesta etapa.',
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
        description="O acompanhamento de acordos em atraso começa após a ativação dos acordos. Nesta etapa, nenhuma proposta é tratada como acordo ativo."
      />
    );
  } else {
    workspace = (
      <>
        <WorkspaceFilters
          view={view}
          ongoingStatus={ongoingStatus}
          search={search}
          onStatus={setOngoingStatus}
          onSearch={setSearch}
        />
        {view === 'A_NEGOCIAR' ? (
          <CandidateGroups
            data={candidates.data}
            loading={candidates.isPending}
            error={candidates.error}
            search={deferredSearch}
            onRetry={() => {
              void candidates.refetch();
            }}
            onStart={setWizardGroup}
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
      {workspace}

      {wizardGroup && readiness.data?.availability === 'AVAILABLE' ? (
        <RenegociacaoWizard
          group={wizardGroup}
          canSave={readiness.data.capabilities.saveProposal}
          saveUnavailableReason={renegociacaoUnavailableMessage(readiness.data.unavailableReasons.saveProposal)}
          onClose={() => setWizardGroup(null)}
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

const WorkspaceFilters: React.FC<{
  view: RenegociacaoView;
  ongoingStatus: Extract<RenegociacaoLifecycleStatus, 'DRAFT' | 'PROPOSED'>;
  search: string;
  onStatus: (status: Extract<RenegociacaoLifecycleStatus, 'DRAFT' | 'PROPOSED'>) => void;
  onSearch: (value: string) => void;
}> = ({ view, ongoingStatus, search, onStatus, onSearch }) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
    {view === 'EM_ANDAMENTO' ? (
      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Situação das propostas">
        {(
          [
            ['PROPOSED', 'Propostas'],
            ['DRAFT', 'Rascunhos'],
          ] as const
        ).map(([status, label]) => (
          <button
            key={status}
            type="button"
            aria-pressed={ongoingStatus === status}
            onClick={() => onStatus(status)}
            className={`min-h-10 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide ${ongoingStatus === status ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
    ) : null}
    <RenegociacaoSearch
      value={search}
      onChange={onSearch}
      placeholder={
        view === 'A_NEGOCIAR' ? 'Buscar aluno, matrícula ou turma...' : 'Buscar proposta por aluno ou turma...'
      }
    />
  </div>
);

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
