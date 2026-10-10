import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react';
import ExternalTransferAcademicFields, { type ExternalTransferDiscipline } from './ExternalTransferAcademicFields';
import ExternalTransferReview from './ExternalTransferReview';
import { externalTransferDraftError, type ExternalTransferDraft } from './external-transfer-draft';
import type { ExternalTransferPreview } from './external-transfer.contract';
import type { ExternalTransferStudent } from './useReceiveExternalTransfer';
export type { ExternalCreditDraft } from './external-transfer-draft';

interface Props {
  students: ExternalTransferStudent[];
  disciplines: ExternalTransferDiscipline[];
  draft: ExternalTransferDraft;
  onChange: <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => void;
  loading: boolean;
  loadError: boolean;
  pending: boolean;
  locked: boolean;
  canClose: boolean;
  canConfirm: boolean;
  uncertain: boolean;
  error: string | null;
  financialSection: React.ReactNode;
  review: ExternalTransferPreview | null;
  studentFixed?: boolean;
  destinationLabel?: string;
  onRetry: () => void;
  onClose: () => void;
  onConfirm: () => void;
}
const steps = ['Origem e disciplinas', 'Plano financeiro', 'Conferir recebimento'];

const ReceiveExternalTransferModal: React.FC<Props> = ({
  students, disciplines, draft, onChange, loading, loadError, pending, locked, canClose, canConfirm,
  uncertain, error, financialSection, review, studentFixed = false, destinationLabel, onRetry, onClose, onConfirm,
}) => {
  const [step, setStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const academicError = externalTransferDraftError(draft);
  const canAdvanceAcademic = !loading && !loadError && !academicError;
  const changeStep = (next: number) => {
    if (locked) return;
    setStep(next);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  return <>
    <header className="flex shrink-0 items-start justify-between bg-violet-700 p-5 text-white sm:p-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">Entrada acadêmica</p>
        <h3 className="mt-1 text-xl font-black">Receber transferência externa</h3>
        {destinationLabel && <p className="mt-2 text-xs text-violet-100">Destino: {destinationLabel}</p>}
      </div>
      <button type="button" disabled={!canClose} aria-label="Fechar recebimento" onClick={onClose} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"><X size={18} /></button>
    </header>
    <ol className="grid shrink-0 grid-cols-3 border-b border-slate-100 bg-slate-50 p-3">
      {steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={`px-1 text-center text-[10px] font-black sm:text-xs ${step === index ? 'text-violet-700' : 'text-slate-400'}`}>
        <span className="block">{index + 1}. {label}</span>
      </li>)}
    </ol>
    <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
      {step === 0 && <ExternalTransferAcademicFields draft={draft} onChange={onChange} students={students} disciplines={disciplines}
        studentFixed={studentFixed} loading={loading} loadError={loadError} disabled={locked} onRetry={onRetry} />}
      {step === 1 && financialSection}
      {step === 2 && <ExternalTransferReview draft={draft} disciplines={disciplines} review={review} destinationLabel={destinationLabel}
        studentName={students.find((student) => student.id === draft.studentId)?.nome || ''} />}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {uncertain && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">O resultado ainda não foi confirmado. Confira a mesma operação para recuperar o recebimento. As informações estão preservadas.</p>}
      {step === 0 && academicError && draft.studentId && <p role="status" className="text-xs text-slate-500">{academicError}</p>}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-between gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:px-6">
      {step > 0 ? <button type="button" onClick={() => changeStep(step - 1)} disabled={locked} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 disabled:opacity-40"><ArrowLeft size={14} />Voltar</button>
        : <button type="button" onClick={onClose} disabled={!canClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 disabled:opacity-40">Cancelar</button>}
      {step < 2 ? <button type="button" onClick={() => changeStep(step + 1)} disabled={locked || (step === 0 ? !canAdvanceAcademic : !canConfirm)}
        className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">
        {step === 0 ? 'Continuar para o financeiro' : 'Conferir recebimento'}<ArrowRight size={14} />
      </button> : <button type="button" onClick={onConfirm} disabled={pending || (!uncertain && !canConfirm)}
        className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">
        {pending && <Loader2 size={14} className="animate-spin" />}{pending ? 'Registrando...' : uncertain ? 'Conferir a mesma operação' : 'Registrar recebimento e plano'}
      </button>}
    </footer>
  </>;
};

export default ReceiveExternalTransferModal;
