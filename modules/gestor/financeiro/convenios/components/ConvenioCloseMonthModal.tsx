import React, { useRef, useState } from 'react';
import { CalendarPlus2, LockKeyhole, Loader2 } from 'lucide-react';
import type { ConvenioFinanceiroMes, FinalizarConvenioMesInput } from '../convenios.types';
import {
  createConvenioRequestId,
  formatConvenioCompetencia,
  formatConvenioCurrency,
} from '../convenios.presentation';
import ConvenioModalShell from './ConvenioModalShell';

interface ConvenioCloseMonthModalProps {
  mes: ConvenioFinanceiroMes;
  isPending: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: (input: FinalizarConvenioMesInput) => void;
}

const ConvenioCloseMonthModal: React.FC<ConvenioCloseMonthModalProps> = ({
  mes,
  isPending,
  error,
  onClose,
  onConfirm,
}) => {
  const [criarProxima, setCriarProxima] = useState(true);
  const requestIdRef = useRef(createConvenioRequestId());
  const hasPending = mes.despesasPendentes > 0;

  return (
    <ConvenioModalShell
      title="Finalizar mês"
      subtitle={`${mes.nome} · ${formatConvenioCompetencia(mes.competencia)}`}
      onClose={onClose}
    >
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Saldo inicial', mes.saldoInicial],
            ['Créditos', mes.creditos],
            ['Despesas pagas', mes.despesasPagas],
            ['Saldo projetado', mes.saldoProjetado],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-black text-[#001a33]">{formatConvenioCurrency(Number(value))}</p>
            </div>
          ))}
        </div>

        {hasPending ? (
          <div role="alert" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <LockKeyhole size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-wide">Fechamento bloqueado</p>
              <p className="mt-1 text-xs font-medium leading-relaxed">
                Existem {formatConvenioCurrency(mes.despesasPendentes)} em despesas pendentes. Quite ou cancele esses compromissos antes de finalizar.
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-medium leading-relaxed text-emerald-900">
            O fechamento congela esta competência. O saldo final será preservado como saldo inicial do próximo mês, sem criar uma nova entrada no Caixa.
          </p>
        )}

        <label className={`flex items-start gap-3 rounded-2xl border p-4 ${hasPending ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60' : 'cursor-pointer border-cyan-100 bg-cyan-50/60'}`}>
          <input type="checkbox" checked={criarProxima} onChange={(event) => setCriarProxima(event.target.checked)} disabled={hasPending} className="mt-0.5 h-4 w-4 rounded border-cyan-300 text-cyan-700 focus:ring-cyan-500" />
          <span>
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]"><CalendarPlus2 size={15} className="text-cyan-700" /> Criar o próximo mês</span>
            <span className="mt-1 block text-xs font-medium text-slate-500">A competência seguinte será aberta automaticamente com o saldo final carregado.</span>
          </span>
        </label>

        {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error.message}</p> : null}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-600 disabled:opacity-50">Voltar</button>
          <button
            type="button"
            disabled={isPending || hasPending}
            onClick={() => onConfirm({ requestId: requestIdRef.current, competenciaId: mes.id, criarProxima })}
            className="inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
            Finalizar mês
          </button>
        </div>
      </div>
    </ConvenioModalShell>
  );
};

export default ConvenioCloseMonthModal;
