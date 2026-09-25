import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import ReceiveExternalTransferModal from './ReceiveExternalTransferModal';
import ExternalTransferFinancialFields from './ExternalTransferFinancialFields';
import { useReceiveExternalTransfer } from './useReceiveExternalTransfer';
import type { ExternalTransferResult } from './external-transfer.contract';

interface Props {
  turmaId: string;
  canReceive: boolean;
  onClose: () => void;
  onSaved: (result: ExternalTransferResult) => Promise<void>;
  onOpenFinanceiro?: (matriculaId: string) => void;
}

const ReceiveExternalTransferController: React.FC<Props> = ({ onClose, onOpenFinanceiro, ...options }: Props) => {
  const state = useReceiveExternalTransfer(options);
  const { draft, change, result } = state;
  if (result) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <section className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h3 className="flex items-center gap-2 font-black text-emerald-800"><CheckCircle2 size={20} />Transferência recebida</h3>
          <button aria-label="Fechar recebimento" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-700">Matrícula, aproveitamentos e plano financeiro foram registrados. Nenhuma cobrança foi gerada.</p>
        <p className="text-sm text-slate-700">Ciclo inicial: {result.financeiro.financeiro.cicloNumero}º. Mensalidades: {result.financeiro.financeiro.quantidadeParcelas}. Primeiro vencimento: {result.financeiro.financeiro.primeiroVencimento.split('-').reverse().join('/')}.</p>
        <p className="text-xs text-slate-600">No Financeiro desta turma, confira o aluno e revise as cobranças antes de emitir. A opção de matrícula local sem boleto continua disponível na revisão do 1º ciclo.</p>
        {state.error && <p role="alert" className="text-xs text-amber-800">{state.error}</p>}
        <button onClick={() => onOpenFinanceiro ? onOpenFinanceiro(result.matriculaId) : onClose()}
          className="w-full rounded-xl bg-violet-700 py-3 text-xs font-black uppercase text-white">
          {onOpenFinanceiro ? 'Abrir Financeiro da turma' : 'Concluir recebimento'}
        </button>
      </section>
    </div>
  );

  return <ReceiveExternalTransferModal
    students={state.students} disciplines={state.disciplines}
    loading={state.loading} loadError={state.loadError} retrying={state.loading}
    pending={state.pending} locked={state.locked} canClose={state.canClose}
    canConfirm={state.ready} uncertain={state.uncertain} error={state.error}
    selectedStudentId={draft.studentId} originInstitution={draft.institution}
    originCourse={draft.course} reason={draft.reason} notes={draft.notes}
    transferDate={draft.transferDate} credits={draft.credits}
    onStudentChange={(value) => change('studentId', value)}
    onInstitutionChange={(value) => change('institution', value)}
    onCourseChange={(value) => change('course', value)}
    onReasonChange={(value) => change('reason', value)}
    onNotesChange={(value) => change('notes', value)}
    onTransferDateChange={(value) => change('transferDate', value)}
    onCreditsChange={(value) => change('credits', value)}
    onRetry={state.retry} onClose={() => { if (state.canDismiss()) onClose(); }}
    onConfirm={() => { void state.confirm(); }}
    financialSection={<ExternalTransferFinancialFields
      draft={draft} onChange={change} context={state.context} review={state.review}
      loading={state.financialLoading} error={state.financialError} disabled={state.locked}
      reviewing={state.reviewing} canReview={state.canReview} onReview={state.reviewPlan}
      onRetry={state.retryFinancial}
    />}
  />;
};

export default ReceiveExternalTransferController;
