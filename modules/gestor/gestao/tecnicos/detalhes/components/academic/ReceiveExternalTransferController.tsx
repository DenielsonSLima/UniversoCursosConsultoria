import React, { useRef, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import ReceiveExternalTransferModal from './ReceiveExternalTransferModal';
import ExternalTransferFinancialFields from './ExternalTransferFinancialFields';
import ExternalTransferScheduleFields from './ExternalTransferScheduleFields';
import ExternalTransferModalShell from './ExternalTransferModalShell';
import { useReceiveExternalTransfer, type ExternalTransferStudent } from './useReceiveExternalTransfer';
import type { ExternalTransferResult } from './external-transfer.contract';
import { useExternalTransferIssuance } from './useExternalTransferIssuance';
import FinanceiroCicloManualLiveProgress from '../financeiro/FinanceiroCicloManualLiveProgress';

interface Props {
  turmaId: string;
  poloId: string;
  canReceive: boolean;
  initialStudent?: ExternalTransferStudent;
  destinationLabel?: string;
  onClose: () => void;
  onSaved: (result: ExternalTransferResult) => Promise<void>;
  onOpenFinanceiro?: (matriculaId: string) => void;
}

const ReceiveExternalTransferController: React.FC<Props> = ({ onClose, onOpenFinanceiro, destinationLabel, poloId, ...options }: Props) => {
  const state = useReceiveExternalTransfer(options);
  const { draft, change, result } = state;
  const emission = useExternalTransferIssuance({ turmaId: options.turmaId, alunoId: draft.studentId, poloId }, options.canReceive);
  const finalizing = useRef(false);
  const [finalizationPending, setFinalizationPending] = useState(false);
  const canClose = state.canClose && (!finalizationPending || Boolean(emission.progress));
  const close = () => {
    if (state.canDismiss() && (!finalizing.current || emission.progress)) onClose();
  };
  const finalize = async () => {
    if (finalizing.current) return;
    finalizing.current = true;
    setFinalizationPending(true);
    try {
      const saved = await state.confirm();
      if (saved) await emission.run(saved);
    } finally {
      finalizing.current = false;
      setFinalizationPending(false);
    }
  };
  return <ExternalTransferModalShell canClose={canClose} onClose={close}
    focusKey={emission.progress ? `emission:${emission.progress.requestId}` : result?.matriculaId || 'form'}>
    {emission.progress ? <>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <p className="text-xs font-bold text-emerald-800">Transferência registrada. Acompanhe a emissão do ciclo liberado.</p>
        {onOpenFinanceiro && <button type="button" onClick={() => onOpenFinanceiro(emission.progress!.matriculaId)}
          className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-bold text-violet-800">Ver Financeiro e carnê</button>}
      </header>
      {emission.error && <p role="alert" className="shrink-0 bg-amber-50 px-5 py-3 text-xs text-amber-900">{emission.error} Consulte a operação existente; a transferência permanece salva.</p>}
      <FinanceiroCicloManualLiveProgress {...emission.progress} onClose={close} />
    </> : result ? <section className="min-h-0 space-y-4 overflow-y-auto p-6">
      <div className="flex items-start justify-between">
        <h3 className="flex items-center gap-2 font-black text-emerald-800"><CheckCircle2 size={20} />Transferência recebida</h3>
        <button type="button" disabled={!canClose} aria-label="Fechar recebimento" onClick={close}><X size={18} /></button>
      </div>
      <p className="text-sm text-slate-700">Matrícula, aproveitamentos e plano financeiro foram registrados.</p>
      {destinationLabel && <p className="text-sm font-bold text-slate-700">Destino: {destinationLabel}</p>}
      <p className="text-sm text-slate-700">{result.financeiro.financeiro.itens.length} cobranças planejadas. Os ciclos seguem o cronograma individual conferido.</p>
      <ul className="space-y-1 text-xs text-slate-600" aria-label="Cobranças planejadas por ciclo">
        {result.financeiro.totais.porCiclo.filter((cycle) => cycle.quantidadeItens > 0).map((cycle) => (
          <li key={cycle.cicloNumero}>{cycle.cicloNumero}º ciclo: {cycle.quantidadeItens} cobranças planejadas.</li>
        ))}
      </ul>
      {finalizationPending && !emission.progress && <p role="status" className="flex items-center gap-2 text-sm text-violet-800"><Loader2 size={18} className="animate-spin" />Conferindo o plano salvo e preparando a emissão do ciclo liberado...</p>}
      {emission.withoutCharges && <p className="text-xs text-slate-600">O recebimento foi concluído sem cobranças planejadas.</p>}
      {emission.completed && <p role="status" className="text-sm font-bold text-emerald-800">Emissão do ciclo confirmada. O próximo ciclo exige uma ação separada.</p>}
      {emission.error && <p role="alert" className="text-xs text-amber-800">A transferência permanece salva. {emission.error} {emission.submitted ? 'Consulte a operação existente; não inicie outra emissão.' : 'Confira o plano no Financeiro antes de emitir.'}</p>}
      {state.error && <p role="alert" className="text-xs text-amber-800">{state.error}</p>}
      <button type="button" disabled={!canClose} onClick={() => onOpenFinanceiro ? onOpenFinanceiro(result.matriculaId) : close()}
        className="w-full rounded-xl bg-violet-700 py-3 text-xs font-black uppercase text-white">
        {onOpenFinanceiro ? 'Ver Financeiro e carnê' : 'Concluir recebimento'}
      </button>
      {onOpenFinanceiro && <button type="button" disabled={!canClose} onClick={close}
        className="w-full rounded-xl border border-slate-200 py-3 text-xs font-bold text-slate-600">Concluir recebimento</button>}
    </section> : <ReceiveExternalTransferModal
      students={state.students} disciplines={state.disciplines} modules={state.modules} draft={draft} onChange={change}
      loading={state.loading} loadError={state.loadError}
      academicLoading={state.academicLoading} academicError={state.academicError}
      pending={state.pending || finalizationPending} locked={state.locked || finalizationPending} canClose={canClose}
      canConfirm={state.ready} uncertain={state.uncertain} error={state.error}
      studentFixed={Boolean(options.initialStudent)} destinationLabel={destinationLabel} review={state.review}
      canConfigure={state.canConfigure} canReview={state.canReview}
      scheduleError={state.scheduleError}
      confirmationIssue={state.confirmationIssue} onRetryFinancial={state.retryFinancial}
      onRetryAcademic={state.retryAcademic} onBackToConfiguration={state.syncConfigurations}
      onFinancialConfigurationAdvance={state.configurePlan} onFinancialScheduleAdvance={state.reviewPlan}
      onRetry={state.retry} onClose={close} onConfirm={() => { void finalize(); }}
      configurationSection={<ExternalTransferFinancialFields
        configurations={state.configurations} onConfigurationChange={state.changeConfiguration} context={state.context}
        loading={state.financialLoading} error={state.financialError} disabled={state.locked}
        onRetry={state.retryFinancial} onRestoreDefaults={state.restoreDefaults}
      />}
      scheduleSection={<ExternalTransferScheduleFields
        draft={draft} onChange={change} context={state.context} review={state.review}
        loading={state.financialLoading} error={state.financialError} disabled={state.locked}
        onRetry={state.retryFinancial} onAdjust={state.adjustSchedule}
      />}
    />}
  </ExternalTransferModalShell>;
};

export default ReceiveExternalTransferController;
