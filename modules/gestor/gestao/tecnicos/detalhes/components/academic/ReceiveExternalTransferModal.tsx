import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react';
import ExternalTransferAcademicFields, { type ExternalTransferDiscipline } from './ExternalTransferAcademicFields';
import ExternalTransferReview from './ExternalTransferReview';
import ExternalTransferNotesFields from './ExternalTransferNotesFields';
import { externalTransferCreditsError, externalTransferOriginError, type ExternalTransferDraft } from './external-transfer-draft';
import type { ExternalTransferPreview } from './external-transfer.contract';
import type { ExternalTransferModule } from './external-transfer-grade';
import type { ExternalTransferConfirmationIssue, ExternalTransferStudent } from './useReceiveExternalTransfer';
export type { ExternalCreditDraft } from './external-transfer-draft';

interface Props {
  students: ExternalTransferStudent[];
  disciplines: ExternalTransferDiscipline[];
  modules: ExternalTransferModule[];
  draft: ExternalTransferDraft;
  onChange: <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => void;
  loading: boolean;
  loadError: boolean;
  academicLoading: boolean;
  academicError: string | null;
  pending: boolean;
  locked: boolean;
  canClose: boolean;
  canConfirm: boolean;
  uncertain: boolean;
  error: string | null;
  configurationSection: React.ReactNode;
  scheduleSection: React.ReactNode;
  canConfigure: boolean;
  canReview: boolean;
  scheduleError: string | null;
  confirmationIssue: ExternalTransferConfirmationIssue | null;
  review: ExternalTransferPreview | null;
  studentFixed?: boolean;
  destinationLabel?: string;
  onRetry: () => void;
  onRetryAcademic: () => void;
  onRetryFinancial: () => void;
  onFinancialConfigurationAdvance: () => Promise<boolean>;
  onFinancialScheduleAdvance: () => Promise<boolean>;
  onBackToConfiguration: () => void;
  onClose: () => void;
  onConfirm: () => void;
}
const steps = ['Aluno e origem', 'Notas', 'Configuração', 'Cobranças', 'Revisão'];

const ReceiveExternalTransferModal: React.FC<Props> = ({
  students, disciplines, modules, draft, onChange, loading, loadError, academicLoading, academicError,
  pending, locked, canClose, canConfirm, canConfigure, canReview, scheduleError, confirmationIssue, uncertain, error,
  configurationSection, scheduleSection, review, studentFixed = false, destinationLabel,
  onRetry, onRetryAcademic, onRetryFinancial, onFinancialConfigurationAdvance, onFinancialScheduleAdvance,
  onBackToConfiguration, onClose, onConfirm,
}) => {
  const [step, setStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const originError = externalTransferOriginError(draft);
  const notesError = externalTransferCreditsError(draft, new Set(disciplines.map((discipline) => discipline.id)));
  const canAdvanceOrigin = !loading && !loadError && !originError;
  const canAdvanceNotes = !academicLoading && !academicError && !notesError;
  useEffect(() => { titleRef.current?.focus(); }, [step]);
  const changeStep = (next: number) => {
    if (locked) return;
    if (step === 3 && next === 2) onBackToConfiguration();
    setStep(next);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const advance = async () => {
    if (locked) return;
    if (step === 2 && !await onFinancialConfigurationAdvance()) return;
    if (step === 3 && !await onFinancialScheduleAdvance()) return;
    changeStep(step + 1);
  };
  const canAdvance = [canAdvanceOrigin, canAdvanceNotes, canConfigure, canReview][step] ?? false;
  const advanceLabels = ['Continuar para as notas', 'Continuar para configuração', 'Gerar lista de cobranças', 'Conferir e revisar'];
  return <>
    <header className="flex shrink-0 items-start justify-between bg-violet-700 p-5 text-white sm:p-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">Entrada acadêmica</p>
        <h3 className="mt-1 text-xl font-black">Receber transferência externa</h3>
        {destinationLabel && <p className="mt-2 text-xs text-violet-100">Destino: {destinationLabel}</p>}
      </div>
      <button type="button" disabled={!canClose} aria-label="Fechar recebimento" onClick={onClose} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"><X size={18} /></button>
    </header>
    <ol className="grid shrink-0 grid-cols-5 border-b border-slate-100 bg-slate-50 p-3">
      {steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={`px-1 text-center text-[10px] font-black sm:text-xs ${step === index ? 'text-violet-700' : 'text-slate-400'}`}>
        <span className="block">{index + 1}. {label}</span>
      </li>)}
    </ol>
    <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
      <h4 ref={(node) => { titleRef.current = node; }} tabIndex={-1} className="text-sm font-black text-[#001a33] outline-none">{step + 1}. {steps[step]}</h4>
      {step === 0 && <ExternalTransferAcademicFields draft={draft} onChange={onChange} students={students} destinationLabel={destinationLabel}
        studentFixed={studentFixed} loading={loading} loadError={loadError} disabled={locked} onRetry={onRetry} />}
      {step === 1 && <ExternalTransferNotesFields draft={draft} onChange={onChange} modules={modules}
        loading={academicLoading} error={academicError} disabled={locked} onRetry={onRetryAcademic} />}
      {step === 2 && configurationSection}
      {step === 2 && scheduleError && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
        <p>{scheduleError}</p>
        <p className="mt-2">Corrija a lista de cobranças antes de gerar novas alterações.</p>
        <button type="button" onClick={() => changeStep(3)} disabled={locked} className="mt-3 font-bold underline">Voltar à lista para corrigir</button>
      </div>}
      {step === 3 && scheduleSection}
      {step === 4 && <ExternalTransferReview draft={draft} disciplines={disciplines} review={review} destinationLabel={destinationLabel}
        studentName={students.find((student) => student.id === draft.studentId)?.nome || ''} />}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {step === 4 && !uncertain && !canConfirm && confirmationIssue && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
        <p>{confirmationIssue.message}</p>
        {confirmationIssue.recovery === 'GRADE' && <button type="button" onClick={() => { onRetryAcademic(); changeStep(1); }} disabled={locked} className="mt-3 font-bold underline">Recarregar e conferir as notas</button>}
        {confirmationIssue.recovery === 'FINANCIAL' && <button type="button" onClick={onRetryFinancial} disabled={locked} className="mt-3 font-bold underline">Consultar financeiro novamente</button>}
        {confirmationIssue.recovery === 'REVIEW' && <button type="button" onClick={() => changeStep(3)} disabled={locked} className="mt-3 font-bold underline">Voltar às cobranças e conferir</button>}
      </div>}
      {uncertain && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">O resultado ainda não foi confirmado. Confira a mesma operação para recuperar o recebimento. As informações estão preservadas.</p>}
      {step === 0 && originError && draft.studentId && <p role="status" className="text-xs text-slate-500">{originError}</p>}
      {step === 1 && notesError && <p role="status" className="text-xs text-amber-800">{notesError}</p>}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-between gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:px-6">
      {step > 0 ? <button type="button" onClick={() => changeStep(step - 1)} disabled={locked} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 disabled:opacity-40"><ArrowLeft size={14} />Voltar</button>
        : <button type="button" onClick={onClose} disabled={!canClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 disabled:opacity-40">Cancelar</button>}
      {step < 4 ? <button type="button" onClick={() => { void advance(); }} disabled={locked || !canAdvance}
        className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">
        {locked && <Loader2 size={14} className="animate-spin" />}{advanceLabels[step]}<ArrowRight size={14} />
      </button> : <button type="button" onClick={onConfirm} disabled={pending || (!uncertain && !canConfirm)}
        className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">
        {pending && <Loader2 size={14} className="animate-spin" />}{pending ? 'Registrando...' : uncertain ? 'Conferir a mesma operação' : 'Registrar recebimento e plano'}
      </button>}
    </footer>
  </>;
};

export default ReceiveExternalTransferModal;
