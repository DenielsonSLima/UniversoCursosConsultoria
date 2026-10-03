import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Info, Loader2, X } from 'lucide-react';
import { createRenegociacaoRequestId } from '../renegociacoes.model';
import { useRenegociacaoCandidateItems, useRenegociacaoMutations } from '../hooks/useRenegociacoesQueries';
import { useRenegociacaoDialogFocus } from '../hooks/useRenegociacaoDialogFocus';
import type {
  PreviewRenegociacaoInput,
  RenegociacaoCandidateGroup,
  RenegociacaoProposalSummary,
  SaveRenegociacaoProposalInput,
} from '../renegociacoes.types';
import CanonicalSummary from './CanonicalSummary';
import SelectionSummaryPanel from './SelectionSummaryPanel';
import RenegociacaoTermsStep from './RenegociacaoTermsStep';
import { useRenegociacaoTermsForm } from '../hooks/useRenegociacaoTermsForm';
import { useRenegociacaoSelectionSummary } from '../hooks/useRenegociacaoSelectionSummary';
import { buildTermsInput, termsFormError } from '../renegociacoes.terms-form';
import { ErrorPanel, LoadingPanel } from './RenegociacaoPanels';
import { Field, inputClass, SelectionStep } from './WizardSteps';
import {
  allEligibleCandidatesSelected,
  candidateIdentityMatchesGroup,
  reconcileCandidateSelection,
  toggleAllEligibleCandidates,
  toggleCandidateSelection,
} from './candidateSelection.model';

interface RenegociacaoWizardProps {
  group: RenegociacaoCandidateGroup;
  canSave: boolean;
  saveUnavailableReason?: string;
  initialSelectedIds?: string[];
  onClose: () => void;
  onSaved: (proposal: RenegociacaoProposalSummary, replayed: boolean) => void;
}

type WizardStep = 'SELECTION' | 'TERMS' | 'REVIEW';
const stepHeading: Record<WizardStep, string> = {
  SELECTION: 'Etapa 1 de 3: seleção de parcelas',
  TERMS: 'Etapa 2 de 3: condições da proposta',
  REVIEW: 'Etapa 3 de 3: revisão e salvamento',
};
const RenegociacaoWizard: React.FC<RenegociacaoWizardProps> = ({
  group,
  canSave,
  saveUnavailableReason,
  initialSelectedIds,
  onClose,
  onSaved,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<globalThis.HTMLHeadingElement>(null);
  const previousStepRef = useRef<WizardStep>('SELECTION');
  const closeActionRef = useRef(onClose);
  closeActionRef.current = onClose;
  const itemsQuery = useRenegociacaoCandidateItems(group.matriculaId);
  const { preview, save } = useRenegociacaoMutations(group.poloId);
  const [step, setStep] = useState<WizardStep>('SELECTION');
  const [selected, setSelected] = useState<string[]>(() => [...new Set(initialSelectedIds || [])]);
  const [reason, setReason] = useState('');
  const [frozenInput, setFrozenInput] = useState<PreviewRenegociacaoInput | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submittedPayload, setSubmittedPayload] = useState<SaveRenegociacaoProposalInput | null>(null);

  const candidateData = itemsQuery.data;
  const identityMatches = Boolean(candidateData && candidateIdentityMatchesGroup(group, candidateData.identity));
  const candidateItems = useMemo(
    () => (identityMatches ? candidateData?.items || [] : []),
    [candidateData, identityMatches],
  );
  const defaults = identityMatches ? candidateData?.policyDefaults : null;
  const financialSummary = useRenegociacaoSelectionSummary(group, selected, candidateData?.asOf);
  const { form, setField } = useRenegociacaoTermsForm(defaults, financialSummary.data?.totals.grossDebtCents);
  const formError = termsFormError(form, defaults);
  const busyRef = useRef(false);
  busyRef.current = save.isPending || preview.isPending;
  useRenegociacaoDialogFocus({ isOpen: true, dialogRef, submittingRef: busyRef, closeRef: closeActionRef });

  const eligibleItems = useMemo(
    () => candidateItems.filter((item) => item.eligibility.eligible),
    [candidateItems],
  );
  const eligibleIds = useMemo(() => new Set(eligibleItems.map((item) => item.receivableId)), [eligibleItems]);
  const allSelected = allEligibleCandidatesSelected(selected, candidateItems);
  const canContinue = Boolean(
    !itemsQuery.isPending &&
      !itemsQuery.isError &&
      identityMatches &&
      defaults &&
      selected.length > 0 &&
      selected.every((id) => eligibleIds.has(id)),
  );
  useEffect(() => {
    if (!candidateData) return;
    setSelected((current) => reconcileCandidateSelection(current, candidateItems));
  }, [candidateData, candidateItems]);
  useEffect(() => {
    if (itemsQuery.data && !defaults && step !== 'SELECTION') setStep('SELECTION');
  }, [defaults, itemsQuery.data, step]);
  useEffect(() => {
    if (previousStepRef.current === step) return undefined;
    previousStepRef.current = step;
    const frame = window.requestAnimationFrame(() => stepHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  const buildInput = (): PreviewRenegociacaoInput | null => canContinue && defaults
    ? buildTermsInput(form, defaults, selected, candidateData?.asOf) : null;
  const selectionSummary = <SelectionSummaryPanel summary={financialSummary.data} count={selected.length}
    loading={financialSummary.loading} error={financialSummary.error} onRetry={() => { void financialSummary.refetch(); }} />;

  const simulate = async () => {
    const input = buildInput();
    if (!input) return;
    try {
      await preview.mutateAsync(input);
      setFrozenInput(input);
      setRequestId(createRenegociacaoRequestId());
      setStep('REVIEW');
    } catch {
      /* feedback is rendered next to the action */
    }
  };
  const submit = async () => {
    if (!frozenInput || !preview.data || !requestId || (preview.data.requiresApproval && !reason.trim())) return;
    const payload = submittedPayload || {
      ...frozenInput,
      requestId,
      expectedProposalFingerprint: preview.data.proposalFingerprint,
      submit: true,
      reason: reason.trim() || null,
    };
    if (!submittedPayload) setSubmittedPayload(payload);
    try {
      const result = await save.mutateAsync(payload);
      onSaved(result.proposal, result.replayed);
    } catch {
      /* keep the same request id for a safe retry */
    }
  };

  const content = (
    <div
      className="fixed inset-0 z-[2147482500] flex h-[100dvh] w-screen overflow-hidden bg-slate-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="renegociacao-wizard-title"
      aria-busy={save.isPending || preview.isPending}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 outline-none"
      >
        <header className="shrink-0 border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Nova proposta</p>
              <h2 id="renegociacao-wizard-title" className="truncate text-lg font-black text-[#001a33] sm:text-xl">
                {group.alunoNome}
              </h2>
              <p className="truncate text-xs font-medium text-slate-500">
                {group.turmaNome}
                {group.matriculaCodigo ? ` • Matrícula ${group.matriculaCodigo}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending || preview.isPending}
              aria-label="Fechar renegociação"
              className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
            >
              <X size={20} />
            </button>
          </div>
        </header>
        <nav className="shrink-0 border-b border-slate-200 bg-white" aria-label="Etapas da renegociação">
          <ol className="mx-auto grid w-full max-w-7xl grid-cols-3 px-3 py-2 sm:px-6 lg:px-8">
            {(
              [
                ['SELECTION', '1. Parcelas'],
                ['TERMS', '2. Condições'],
                ['REVIEW', '3. Revisão'],
              ] as const
            ).map(([id, label]) => (
              <li
                key={id}
                aria-current={step === id ? 'step' : undefined}
                className={`border-b-2 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide ${step === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}`}
              >
                {label}
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:px-8">
            <h3 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
              {stepHeading[step]}
            </h3>
          {itemsQuery.isPending ? (
            <LoadingPanel label="Carregando parcelas e regras da turma..." />
          ) : itemsQuery.isError ? (
            <ErrorPanel
              error={itemsQuery.error}
              onRetry={() => {
                void itemsQuery.refetch();
              }}
            />
          ) : candidateData && !identityMatches ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
              Os dados retornados não pertencem a este aluno, matrícula, turma e polo. Feche a proposta e atualize a
              lista antes de continuar.
            </div>
          ) : step === 'SELECTION' ? (
            <div className="space-y-4">
              {selectionSummary}
              <SelectionStep
                items={candidateItems}
                selected={selected}
                allSelected={allSelected}
                onToggleAll={() =>
                  setSelected((current) => toggleAllEligibleCandidates(current, candidateItems))
                }
                onToggle={(id) =>
                  setSelected((current) => toggleCandidateSelection(current, id, candidateItems))
                }
              />
              {!defaults ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"
                >
                  As parcelas foram atualizadas e nenhuma permanece elegível. Revise os motivos e volte à lista.
                </div>
              ) : null}
            </div>
          ) : step === 'TERMS' && defaults ? (
            <div className="space-y-4">
              {selectionSummary}
              <RenegociacaoTermsStep defaults={defaults} disabled={preview.isPending} form={form} setField={setField} />
              {formError ? <p role="status" className="text-xs font-medium text-amber-800">{formError}</p> : null}
              {preview.isError ? <ErrorPanel error={preview.error} /> : null}
            </div>
          ) : step === 'REVIEW' && preview.data ? (
            <div className="space-y-4">
              <CanonicalSummary
                totals={preview.data.totals}
                schedule={preview.data.schedule}
                policy={preview.data.policySnapshot}
                sourceItems={preview.data.sourceItems}
                requiresApproval={preview.data.requiresApproval}
                approvalReasons={preview.data.approvalReasons}
              />
              <Field label={preview.data.requiresApproval ? 'Justificativa obrigatória' : 'Observação da proposta'}>
                <textarea
                  rows={3}
                  value={reason}
                  disabled={Boolean(submittedPayload)}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    preview.data.requiresApproval ? 'Explique por que estas condições foram concedidas...' : 'Opcional'
                  }
                  className={`${inputClass} resize-y py-3 disabled:opacity-60`}
                />
              </Field>
              <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs font-medium text-blue-900">
                <Info size={17} className="shrink-0" />
                <p>
                  Salvar registra somente a proposta. Nenhum título original será cancelado, substituído ou enviado ao
                  banco nesta etapa.
                </p>
              </div>
              {!canSave ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"
                >
                  {saveUnavailableReason || 'O salvamento de propostas ainda não está disponível.'}
                </div>
              ) : null}
              {save.isError ? <ErrorPanel error={save.error} /> : null}
            </div>
          ) : null}
          </div>
        </main>

        <footer className="shrink-0 border-t border-slate-200 bg-white shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.45)]">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 p-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => {
                if (step === 'SELECTION') onClose();
                else {
                  setStep(step === 'REVIEW' ? 'TERMS' : 'SELECTION');
                  if (step === 'REVIEW') {
                    setFrozenInput(null);
                    setRequestId(null);
                    setSubmittedPayload(null);
                    save.reset();
                  }
                }
              }}
              disabled={save.isPending || preview.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wide text-slate-600 disabled:opacity-40"
            >
              <ArrowLeft size={15} /> {step === 'SELECTION' ? 'Cancelar' : 'Voltar'}
            </button>
            {step === 'SELECTION' ? (
              <button type="button" disabled={!canContinue} onClick={() => setStep('TERMS')} className={primaryButton}>
                <span>Continuar</span>
                <ArrowRight size={15} />
              </button>
            ) : null}
            {step === 'TERMS' ? (
              <button
                type="button"
                disabled={!buildInput() || preview.isPending}
                onClick={() => {
                  void simulate();
                }}
                className={primaryButton}
              >
                {preview.isPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Simular
              </button>
            ) : null}
            {step === 'REVIEW' ? (
              <button
                type="button"
                disabled={!canSave || save.isPending || Boolean(preview.data?.requiresApproval && !reason.trim())}
                onClick={() => {
                  void submit();
                }}
                className={primaryButton}
              >
                {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{' '}
                {submittedPayload && save.isError ? 'Tentar novamente' : 'Salvar proposta'}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(content, document.body);
};

const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45';

export default RenegociacaoWizard;
