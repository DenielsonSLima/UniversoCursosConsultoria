import React, { useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, X, XCircle } from 'lucide-react';
import {
  CancelarOuEstornarDespesaInput,
  createFinanceRequestId,
  DespesaLancamento,
} from '../despesas.service';
import { formatDespesaCurrency } from './despesaPresentation';

interface DespesaCancelModalProps {
  item: DespesaLancamento;
  onConfirm: (input: CancelarOuEstornarDespesaInput) => void;
  onClose: () => void;
  isPending: boolean;
  tone?: 'rose' | 'indigo';
}

const DespesaCancelModal: React.FC<DespesaCancelModalProps> = ({
  item,
  onConfirm,
  onClose,
  isPending,
  tone = 'rose',
}) => {
  const isPago = item.status === 'PAGO';
  const [motivo, setMotivo] = useState('');
  const [confirmouEstorno, setConfirmouEstorno] = useState(false);
  const requestIdRef = useRef(createFinanceRequestId());
  const color = tone === 'indigo'
    ? {
        primary: 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500',
        soft: 'border-indigo-200 bg-indigo-50 text-indigo-800',
        check: 'text-indigo-700 accent-indigo-600',
      }
    : {
        primary: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500',
        soft: 'border-rose-200 bg-rose-50 text-rose-800',
        check: 'text-rose-700 accent-rose-600',
      };

  const canConfirm = motivo.trim().length >= 3 && (!isPago || confirmouEstorno);

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancelar-despesa-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl animate-fadeIn"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id="cancelar-despesa-title" className="text-lg font-black uppercase tracking-tight text-[#001a33]">
              {isPago ? 'Estornar e cancelar' : 'Cancelar lançamento'}
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">{item.descricao}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        {isPago ? (
          <div className={`mb-5 rounded-2xl border p-4 ${color.soft}`}>
            <div className="flex gap-3">
              <AlertTriangle size={19} className="mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-black">Esta ação corrige o saldo interno e preserva o histórico da baixa.</p>
                <p className="mt-1 text-xs font-medium leading-5">
                  Conta, valor pago ({formatDespesaCurrency(item.valorPago ?? item.valor)}), data e forma de pagamento não serão apagados. O sistema não movimenta o banco real: confirme o estorno externo antes de continuar.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-medium leading-5 text-slate-600">
            O lançamento ficará cancelado e continuará no histórico. Nenhum registro financeiro será excluído fisicamente.
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Motivo do {isPago ? 'estorno e cancelamento' : 'cancelamento'} *</span>
          <textarea
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            rows={4}
            placeholder="Explique o motivo para manter a trilha de auditoria..."
            className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        {isPago && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={confirmouEstorno}
              onChange={(event) => setConfirmouEstorno(event.target.checked)}
              className={`mt-0.5 h-4 w-4 rounded ${color.check}`}
            />
            <span>Confirmo que o estorno no banco ou caixa externo já foi providenciado.</span>
          </label>
        )}

        <footer className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onConfirm({
              requestId: requestIdRef.current,
              motivo: motivo.trim(),
              confirmarEstorno: isPago,
            })}
            disabled={!canConfirm || isPending}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-black uppercase tracking-wide text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${color.primary}`}
          >
            {isPending ? <RefreshCw size={15} className="animate-spin" /> : isPago ? <RotateCcw size={15} /> : <XCircle size={15} />}
            {isPago ? 'Estornar e cancelar' : 'Cancelar'}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default DespesaCancelModal;
