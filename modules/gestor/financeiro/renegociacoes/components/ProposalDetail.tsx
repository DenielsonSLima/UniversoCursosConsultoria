import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Clock3, Trash2 } from 'lucide-react';
import { createRenegociacaoRequestId, formatCents, formatRenegociacaoDate } from '../renegociacoes.model';
import { useRenegociacaoDialogFocus } from '../hooks/useRenegociacaoDialogFocus';
import { useRenegociacaoMutations, useRenegociacaoProposal } from '../hooks/useRenegociacoesQueries';
import type { DiscardRenegociacaoProposalInput } from '../renegociacoes.types';
import CanonicalSummary from './CanonicalSummary';
import DiscardProposalDialog from './DiscardProposalDialog';
import ActivationPanel from './ActivationPanel';
import { ErrorPanel, LoadingPanel } from './RenegociacaoPanels';

interface ProposalDetailProps {
  agreementId: string;
  poloId?: string | null;
  onBack: () => void;
  onDiscarded: () => void;
}

const ProposalDetail: React.FC<ProposalDetailProps> = ({ agreementId, poloId, onBack, onDiscarded }) => {
  const query = useRenegociacaoProposal(agreementId);
  const { discard } = useRenegociacaoMutations(poloId);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showActivation, setShowActivation] = useState(false);
  const [activationPending, setActivationPending] = useState(false);
  const [discardPayload, setDiscardPayload] = useState<DiscardRenegociacaoProposalInput | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const closeActionRef = useRef(onBack);
  busyRef.current = discard.isPending || activationPending;
  closeActionRef.current = onBack;
  useRenegociacaoDialogFocus({ isOpen: true, dialogRef, submittingRef: busyRef, closeRef: closeActionRef });

  const detail = query.data;
  const proposal = detail?.proposal;
  const statusLabel = proposal ? {
    DRAFT: 'Rascunho', PROPOSED: 'Proposta salva', CANCELED: 'Proposta descartada',
    ACTIVATING: 'Efetivação em andamento', ACTIVE: 'Acordo efetivado', REVIEW_REQUIRED: 'Revisão necessária',
  }[proposal.lifecycleStatus] : 'Detalhes da proposta';

  const confirmDiscard = async (reason: string) => {
    if (!proposal) return;
    const payload = discardPayload || {
      requestId: createRenegociacaoRequestId(),
      agreementId: proposal.id,
      expectedVersion: proposal.version,
      expectedFingerprint: proposal.proposalFingerprint,
      reason,
    };
    if (!discardPayload) setDiscardPayload(payload);
    try {
      await discard.mutateAsync(payload);
      setShowDiscard(false);
      onDiscarded();
    } catch {
      // A repetição preserva requestId e o mesmo payload para ser idempotente.
    }
  };

  const content = (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="renegociacao-detail-title"
      aria-busy={query.isFetching || discard.isPending || activationPending}
      aria-hidden={showDiscard || showActivation ? true : undefined}
      className="fixed inset-0 z-[2147482500] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-50 text-slate-900 outline-none"
    >
      <header className="shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex min-h-[76px] w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBack}
            disabled={discard.isPending || activationPending}
            aria-label="Fechar detalhes da proposta"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
          >
            <ArrowLeft size={17} /> <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-700">Financeiro · renegociação</p>
            <h2 id="renegociacao-detail-title" className="truncate text-lg font-black text-[#001a33] sm:text-xl">
              {proposal ? `Proposta de ${proposal.studentName}` : 'Detalhes da proposta'}
            </h2>
            <p className="truncate text-[10px] font-semibold text-slate-500 sm:text-xs">{statusLabel}</p>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {query.isPending ? (
            <LoadingPanel label="Carregando proposta e histórico..." />
          ) : query.isError || !detail || !proposal ? (
            <ErrorPanel
              error={query.error || new Error('A proposta não foi retornada pelo servidor.')}
              onRetry={() => {
                void query.refetch();
              }}
            />
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">{statusLabel}</p>
                    <h3 className="mt-1 text-xl font-black text-[#001a33]">{proposal.studentName}</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {proposal.className} • Data-base {formatRenegociacaoDate(proposal.asOf)}
                    </p>
                  </div>
                  {proposal.capabilities.canDiscard ? (
                    <button
                      type="button"
                      disabled={activationPending}
                      onClick={() => {
                        setDiscardPayload(null);
                        discard.reset();
                        setShowDiscard(true);
                      }}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-xs font-black uppercase text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <Trash2 size={15} /> Descartar proposta
                    </button>
                  ) : null}
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <HeaderValue label="Saldo selecionado" value={formatCents(proposal.sourceOpenCents)} />
                  <HeaderValue label="Total proposto" value={formatCents(proposal.negotiatedCents)} strong />
                  <HeaderValue label="Títulos" value={String(proposal.sourceCount)} />
                  <HeaderValue label="Primeiro vencimento" value={formatRenegociacaoDate(proposal.firstDueDate)} />
                </dl>
              </section>

              <ActivationPanel key={proposal.id} detail={detail} onDialogChange={setShowActivation} onBusyChange={setActivationPending} />

              <CanonicalSummary
                totals={detail.totals}
                schedule={detail.schedule}
                policy={detail.policySnapshot}
                sourceItems={detail.sourceItems}
                requiresApproval={detail.canonicalSnapshot.requiresApproval}
                approvalReasons={detail.canonicalSnapshot.approvalReasons}
              />

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]">
                  <Clock3 size={16} className="text-blue-600" /> Histórico auditável
                </h3>
                {detail.events.length ? (
                  <ol className="mt-4 space-y-4">
                    {detail.events.map((event) => (
                      <li key={event.id} className="relative border-l-2 border-slate-200 pl-4">
                        <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-blue-600" />
                        <p className="text-xs font-black text-slate-700">{event.label}</p>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                          {formatRenegociacaoDate(event.occurredAt)}
                          {event.actorName ? ` • ${event.actorName}` : ''}
                        </p>
                        {event.details ? <p className="mt-1 text-xs text-slate-500">{event.details}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-xs font-medium text-slate-400">Nenhum evento adicional registrado.</p>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {showDiscard && proposal ? (
        <DiscardProposalDialog
          studentName={proposal.studentName}
          pending={discard.isPending}
          error={discard.error}
          locked={Boolean(discardPayload)}
          onClose={() => {
            if (!discard.isPending) setShowDiscard(false);
          }}
          onConfirm={(reason) => {
            void confirmDiscard(reason);
          }}
        />
      ) : null}
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(content, document.body);
};

const HeaderValue: React.FC<{
  label: string;
  value: string;
  strong?: boolean;
}> = ({ label, value, strong }) => (
  <div>
    <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className={`mt-1 text-sm ${strong ? 'font-black text-blue-800' : 'font-bold text-slate-700'}`}>{value}</dd>
  </div>
);

export default ProposalDetail;
