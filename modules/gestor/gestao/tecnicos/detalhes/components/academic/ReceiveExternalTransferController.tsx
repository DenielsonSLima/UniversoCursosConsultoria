import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import ReceiveExternalTransferModal from './ReceiveExternalTransferModal';
import ExternalTransferFinancialFields from './ExternalTransferFinancialFields';
import ExternalTransferModalShell from './ExternalTransferModalShell';
import { useReceiveExternalTransfer, type ExternalTransferStudent } from './useReceiveExternalTransfer';
import type { ExternalTransferResult } from './external-transfer.contract';

interface Props {
  turmaId: string;
  canReceive: boolean;
  initialStudent?: ExternalTransferStudent;
  destinationLabel?: string;
  onClose: () => void;
  onSaved: (result: ExternalTransferResult) => Promise<void>;
  onOpenFinanceiro?: (matriculaId: string) => void;
}

const ReceiveExternalTransferController: React.FC<Props> = ({ onClose, onOpenFinanceiro, destinationLabel, ...options }: Props) => {
  const state = useReceiveExternalTransfer(options);
  const { draft, change, result } = state;
  const close = () => { if (state.canDismiss()) onClose(); };
  return <ExternalTransferModalShell canClose={state.canClose} onClose={close} focusKey={result?.matriculaId || 'form'}>
    {result ? <section className="space-y-4 p-6">
      <div className="flex items-start justify-between">
        <h3 className="flex items-center gap-2 font-black text-emerald-800"><CheckCircle2 size={20} />Transferência recebida</h3>
        <button type="button" aria-label="Fechar recebimento" onClick={close}><X size={18} /></button>
      </div>
      <p className="text-sm text-slate-700">Matrícula, aproveitamentos e plano financeiro foram registrados. Nenhuma cobrança foi gerada.</p>
      {destinationLabel && <p className="text-sm font-bold text-slate-700">Destino: {destinationLabel}</p>}
      <p className="text-sm text-slate-700">Ciclo inicial: {result.financeiro.financeiro.cicloNumero}º. {result.financeiro.financeiro.cobrarMensalidades ? `Mensalidades: ${result.financeiro.financeiro.quantidadeParcelas}.` : 'Sem mensalidades.'} Primeiro vencimento: {result.financeiro.financeiro.primeiroVencimento.split('-').reverse().join('/')}.</p>
      <p className="text-xs text-slate-600">As condições individuais ficam no Financeiro da turma para conferência e emissão das cobranças aplicáveis.</p>
      {state.error && <p role="alert" className="text-xs text-amber-800">{state.error}</p>}
      <button type="button" onClick={() => onOpenFinanceiro ? onOpenFinanceiro(result.matriculaId) : close()}
        className="w-full rounded-xl bg-violet-700 py-3 text-xs font-black uppercase text-white">
        {onOpenFinanceiro ? 'Abrir Financeiro da turma' : 'Concluir recebimento'}
      </button>
    </section> : <ReceiveExternalTransferModal
      students={state.students} disciplines={state.disciplines} draft={draft} onChange={change}
      loading={state.loading} loadError={state.loadError}
      pending={state.pending} locked={state.locked} canClose={state.canClose}
      canConfirm={state.ready} uncertain={state.uncertain} error={state.error}
      studentFixed={Boolean(options.initialStudent)} destinationLabel={destinationLabel} review={state.review}
      onRetry={state.retry} onClose={close} onConfirm={() => { void state.confirm(); }}
      financialSection={<ExternalTransferFinancialFields
        draft={draft} onChange={change} context={state.context} review={state.review}
        loading={state.financialLoading} error={state.financialError} disabled={state.locked}
        reviewing={state.reviewing} canReview={state.canReview} onReview={state.reviewPlan}
        onRetry={state.retryFinancial} onRestoreDefaults={state.restoreDefaults}
      />}
    />}
  </ExternalTransferModalShell>;
};

export default ReceiveExternalTransferController;
