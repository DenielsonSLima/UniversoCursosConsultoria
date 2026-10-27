import React, { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { manualCycleProgressOptions } from './manual-cycle-progress.service';
import { observedCycleCompletion } from './manual-cycle-observation';
import { forgetPendingCycleObservation, getPendingCycleObservation, subscribePendingCycleObservation,
  type PendingCycleObservation } from './manual-cycle-pending-observation';
import FinanceiroCicloManualLiveProgress from './FinanceiroCicloManualLiveProgress';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';

const Recovery: React.FC<{ pending: PendingCycleObservation }> = ({ pending }) => {
  const [open, setOpen] = useState(false);
  const { dialogRef } = useAccessibleDialog(open, () => setOpen(false));
  const query = useQuery({ ...manualCycleProgressOptions(pending),
    refetchInterval: (state) => state.state.error || (state.state.data && observedCycleCompletion(state.state.data)) ? false : 5_000,
  });
  const cycle = query.data?.ciclo;
  const complete = Boolean(query.data && observedCycleCompletion(query.data));
  const modal = open ? <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Acompanhamento da operação existente"
    tabIndex={-1} className="fixed inset-0 z-[2147483000] flex h-[100dvh] flex-col bg-slate-100">
    <FinanceiroCicloManualLiveProgress {...pending} alunoNome="Operação existente"
      matriculaExibicao={pending.matriculaId.slice(0, 8).toUpperCase()} quantidadeItens={cycle?.quantidadeItens ?? null}
      quantidadeBancaria={cycle?.quantidadeBancaria} total={cycle?.total ?? null} onClose={() => setOpen(false)} />
  </div> : null;
  return <>
    <section role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <p className="font-bold">{complete ? 'Emissão confirmada' : 'Acompanhamento preservado'} · {pending.cicloNumero}º ciclo · {pending.matriculaId.slice(0, 8).toUpperCase()}</p>
      <p className="mt-1 text-xs">{cycle ? `${cycle.emitidosBanese}/${cycle.quantidadeBancaria} títulos emitidos · ${cycle.pendentesEmissao} pendentes · ${cycle.emRevisao} em revisão.` : 'Quantidade emitida ainda não confirmada.'} Esta consulta não gera nem repete cobranças.</p>
      {query.isError && <p role="alert" className="mt-2 text-xs text-amber-900">Não foi possível atualizar o progresso. A emissão pode ter continuado; não gere novamente.</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white">Ver acompanhamento</button>
        <button type="button" disabled={query.isFetching} onClick={() => { void query.refetch({ cancelRefetch: false }); }} className="text-xs font-bold underline disabled:opacity-50">Consultar novamente</button>
        {complete && <button type="button" onClick={() => forgetPendingCycleObservation(pending)} className="text-xs font-bold underline">Dispensar aviso</button>}
      </div>
    </section>
    {typeof document === 'undefined' ? modal : modal && createPortal(modal, document.body)}
  </>;
};

export default function FinanceiroCycleObservationRecovery({ turmaId }: { turmaId: string }) {
  const pending = useSyncExternalStore(subscribePendingCycleObservation,
    () => getPendingCycleObservation(turmaId), () => null);
  return pending ? <Recovery key={`${pending.matriculaId}:${pending.cicloNumero}:${pending.requestId ?? ''}`} pending={pending} /> : null;
}
