import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRenegociacaoActivation } from '../hooks/useRenegociacaoActivation';
import { useRenegociacaoReadiness } from '../hooks/useRenegociacoesQueries';
import { activationStateLabel, latestActivationProgress, resumeActivationInput, type ActivateRenegociacaoInput } from '../renegociacoes.activation';
import { createRenegociacaoRequestId, renegociacaoErrorMessage, renegociacaoUnavailableMessage } from '../renegociacoes.presentation';
import type { RenegociacaoProposalDetail } from '../renegociacoes.types';
import ActivationConfirmation from './ActivationConfirmation';
import { runActivationSequence } from '../renegociacoes.activation-sequence';

const ActivationPanel: React.FC<{
  detail: RenegociacaoProposalDetail; onDialogChange: (open: boolean) => void; onBusyChange: (busy: boolean) => void;
}> = ({ detail, onDialogChange, onBusyChange }) => {
  const { proposal } = detail;
  const readiness = useRenegociacaoReadiness(proposal.poloId);
  const capabilities = readiness.data?.availability === 'AVAILABLE' ? readiness.data.capabilities : undefined;
  const available = Boolean(!readiness.isError && !readiness.isPending && !readiness.isFetching
    && capabilities?.activate && capabilities.cancelSourceTitles && capabilities.issueReplacementTitles);
  const { operation, activation } = useRenegociacaoActivation(proposal.id, capabilities?.getActivation === true);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; onBusyChange(false); onDialogChange(false); };
  }, [onBusyChange, onDialogChange]);
  const payloadRef = useRef<ActivateRenegociacaoInput | null>(null);
  const inFlightRef = useRef(false);
  const progress = latestActivationProgress(operation.data, activation.data);
  const reviewRequired = progress?.state === 'REVIEW_REQUIRED' || proposal.lifecycleStatus === 'REVIEW_REQUIRED';
  const active = !reviewRequired && (progress?.state === 'ACTIVE' || proposal.lifecycleStatus === 'ACTIVE');
  const checked = capabilities?.getActivation === true && operation.isSuccess && !operation.isFetching && !operation.isError;
  const requiresApproval = detail.canonicalSnapshot.requiresApproval;
  const canApproveCustomTerms = proposal.capabilities.canApproveCustomTerms === true;
  const canStart = available && checked && !operation.data && proposal.capabilities.canActivate
    && (!requiresApproval || canApproveCustomTerms);
  const canResume = available && checked && operation.data?.retryable && proposal.capabilities.canResume
    && (!operation.data.approvedCustomTerms || canApproveCustomTerms);
  const setConfirmation = (open: boolean) => { setShowConfirmation(open); onDialogChange(open); };

  const invoke = async (input: ActivateRenegociacaoInput) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSequenceRunning(true);
    onBusyChange(true);
    payloadRef.current = input;
    try {
      await runActivationSequence({ input, invoke: activation.mutateAsync, initial: operation.data,
        shouldContinue: () => mountedRef.current,
        onProgress: () => { if (mountedRef.current) setConfirmation(false); },
      });
    } catch {
      // A chave e o CAS originais são preservados. Uma resposta incerta não libera outra operação.
      if (mountedRef.current) setConfirmation(false);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) { setSequenceRunning(false); onBusyChange(false); }
    }
  };
  const begin = (approveCustomTerms: boolean) => {
    if (!canStart || activation.isPending || (requiresApproval && (!approveCustomTerms || !canApproveCustomTerms))) return;
    void invoke(payloadRef.current || { agreementId: proposal.id, requestId: createRenegociacaoRequestId(),
      expectedVersion: proposal.version, expectedFingerprint: proposal.proposalFingerprint, confirm: true,
      approveCustomTerms: requiresApproval && canApproveCustomTerms && approveCustomTerms });
  };
  const resume = () => {
    if (!canResume || !operation.data || activation.isPending) return;
    void invoke(resumeActivationInput(operation.data));
  };
  if (proposal.lifecycleStatus === 'DRAFT' || proposal.lifecycleStatus === 'CANCELED') return null;
  return <section aria-label="Efetivação bancária" aria-busy={sequenceRunning || activation.isPending}
    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="flex items-center gap-2 text-sm font-black text-[#001a33]">
      {active ? <CheckCircle2 size={18} className="text-emerald-600" /> : reviewRequired ? <AlertTriangle size={18} className="text-amber-600" /> : <ShieldCheck size={18} className="text-blue-600" />}
      {active ? 'Acordo efetivado' : reviewRequired ? 'Revisão necessária' : 'Efetivação bancária'}
    </h3>
    <p className="text-xs font-medium text-slate-600">{active
      ? 'O servidor confirmou a substituição dos títulos. Consulte o histórico do acordo.'
      : reviewRequired ? 'A operação foi interrompida para conferência. Não emita novamente nem descarte os títulos para tentar contornar esta situação.'
      : progress ? activationStateLabel[progress.state]
      : 'Salvar a proposta não cancela cobranças. A substituição exige conferência e confirmação explícita abaixo.'}</p>
    {progress ? <div className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-2">
      <p>Originais com cancelamento confirmado: {progress.sourcesCanceled} / {progress.sourcesTotal}</p>
      <p>Novos títulos emitidos: {progress.replacementsIssued} / {progress.replacementsTotal}</p>
    </div> : null}
    {sequenceRunning ? <p role="status" className="flex items-center gap-2 text-xs font-bold text-blue-700"><Loader2 size={15} className="animate-spin" /> Processando os títulos e conferindo cada etapa no banco...</p> : null}
    {!sequenceRunning && activation.data?.code ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">{activation.data.message}</p> : null}
    {!sequenceRunning && canResume ? <p className="text-xs font-medium text-slate-600">Há etapas pendentes. Use Continuar operação para retomar a mesma solicitação, preservando os títulos já confirmados.</p> : null}
    {operation.data?.approvedCustomTerms ? <p className="text-xs font-medium text-slate-600">As condições personalizadas foram aprovadas no início desta operação. A retomada preserva essa aprovação.</p> : null}
    {operation.isError || readiness.isError || activation.isError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
      {renegociacaoErrorMessage(activation.error || operation.error || readiness.error)} Não presuma que a operação foi desfeita; confira o andamento.
    </p> : null}
    {!active && !reviewRequired && !progress && !canStart && !operation.isFetching ? <p className="text-xs text-slate-500">
      {renegociacaoUnavailableMessage(proposal.capabilities.activationUnavailableReason, 'A efetivação ainda não está autorizada para esta proposta.')}
    </p> : null}
    <div className="flex flex-wrap gap-2">
      {canStart && !active && !reviewRequired ? <button type="button" disabled={sequenceRunning || activation.isPending} onClick={() => setConfirmation(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black uppercase text-white disabled:opacity-40">
        <ShieldCheck size={16} /> Conferir e efetivar acordo
      </button> : null}
      {canResume && !active && !reviewRequired ? <button type="button" disabled={sequenceRunning || activation.isPending} onClick={resume}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black uppercase text-white disabled:opacity-40">
        {activation.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Continuar operação
      </button> : null}
      <button type="button" disabled={sequenceRunning || activation.isPending || operation.isFetching || readiness.isFetching}
        onClick={() => { void readiness.refetch(); if (capabilities?.getActivation) void operation.refetch(); }}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase text-slate-600 disabled:opacity-40">
        <RefreshCw size={15} /> Conferir andamento
      </button>
    </div>
    {showConfirmation ? <ActivationConfirmation detail={detail} pending={sequenceRunning || activation.isPending} error={activation.error}
      onClose={() => { if (!sequenceRunning && !activation.isPending) setConfirmation(false); }} onConfirm={begin} /> : null}
  </section>;
};

export default ActivationPanel;
