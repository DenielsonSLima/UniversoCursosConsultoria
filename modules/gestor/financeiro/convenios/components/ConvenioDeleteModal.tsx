import React, { useRef, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import type { ConvenioFinanceiroMes, ExcluirConvenioInput } from '../convenios.types';
import { createConvenioRequestId, formatConvenioCompetencia } from '../convenios.presentation';
import ConvenioModalShell from './ConvenioModalShell';

interface ConvenioDeleteModalProps {
  mes: ConvenioFinanceiroMes;
  isPending: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: (input: ExcluirConvenioInput) => void;
}

const ConvenioDeleteModal: React.FC<ConvenioDeleteModalProps> = ({
  mes, isPending, error, onClose, onConfirm,
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const requestIdRef = useRef(createConvenioRequestId());

  return (
    <ConvenioModalShell
      title="Excluir convênio"
      subtitle={`${mes.nome} · ${formatConvenioCompetencia(mes.competencia)}`}
      onClose={() => { if (!isPending) onClose(); }}
    >
      <div className="space-y-5 p-6">
        <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black">Retirar este convênio da lista?</p>
            <p className="mt-2 text-sm leading-relaxed">
              Esta ação exclui o convênio inteiro da operação, não apenas o mês exibido.
              O cadastro do parceiro e a trilha de auditoria serão preservados.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          Permitido somente para um cadastro inicial sem créditos, despesas, saldo transportado
          ou mês finalizado. Movimentações canceladas ou estornadas também impedem a exclusão.
          O sistema confere todo o histórico antes de concluir.
        </p>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-rose-700 focus:ring-rose-500"
          />
          Confirmo a exclusão do convênio {mes.nome}.
        </label>
        {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error.message}</p> : null}
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-600 disabled:opacity-50">Voltar</button>
          <button
            type="button"
            disabled={!confirmed || isPending}
            onClick={() => {
              if (!confirmed || isPending) return;
              onConfirm({ requestId: requestIdRef.current, poloId: mes.poloId, convenioId: mes.convenioId });
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {isPending ? 'Excluindo...' : 'Excluir convênio'}
          </button>
        </div>
      </div>
    </ConvenioModalShell>
  );
};

export default ConvenioDeleteModal;
