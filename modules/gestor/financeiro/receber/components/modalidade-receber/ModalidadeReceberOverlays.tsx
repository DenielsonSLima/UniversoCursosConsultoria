import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RefreshCw, X } from 'lucide-react';
import type { ContaBancaria } from '../../../financeiro.service';
import ManualSettlementModal from '../manual-settlement/ManualSettlementModal';
import type { ManualSettlementPayload } from '../manual-settlement/useManualSettlementForm';
import type { ModalidadeReceberOperations } from './useModalidadeReceberOperations';
import { paymentGatewayLabel } from './modalidade-receber.utils';

interface ModalidadeReceberOverlaysProps {
  operations: ModalidadeReceberOperations;
  settlementAccounts: ContaBancaria[];
}

export const ModalidadeReceberOverlays: React.FC<ModalidadeReceberOverlaysProps> = ({
  operations,
  settlementAccounts,
}) => {
  const {
    selected,
    reversalItem,
    reversalReason,
    recreateAsaas,
    paymentMutation,
    reversalMutation,
    setReversalReason,
    setRecreateAsaas,
    closePaymentModal,
    closeReversalModal,
  } = operations;

  return (
    <>
      {selected && typeof document !== 'undefined' ? createPortal((
        <ManualSettlementModal
          key={selected.id}
          receivable={selected}
          accounts={settlementAccounts}
          initialAccountId={(
            settlementAccounts.find((account) => account.poloId === selected.poloId)
            || settlementAccounts.find((account) => !account.poloId)
          )?.id || ''}
          pending={paymentMutation.isPending}
          error={paymentMutation.error instanceof Error ? paymentMutation.error.message : null}
          onClose={closePaymentModal}
          onConfirm={(payload: ManualSettlementPayload) => paymentMutation.mutate(payload)}
        />
      ), document.body) : null}

      {reversalItem && typeof document !== 'undefined' ? createPortal((
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex min-h-screen w-full items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !reversalMutation.isPending) closeReversalModal();
          }}
        >
          <div
            className="relative w-full max-w-xl rounded-[2rem] bg-white p-7 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeReversalModal}
              disabled={reversalMutation.isPending}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
            >
              <X size={18} />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-rose-50 p-3 text-rose-600"><RefreshCw size={22} /></div>
              <div>
                <h5 className="font-black uppercase text-[#001a33]">Estornar baixa manual</h5>
                <p className="text-xs text-slate-500">{reversalItem.clienteNome} · {reversalItem.descricao}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
              <p>Essa ação desfaz somente a baixa lançada manualmente no sistema.</p>
              <p>O recebível volta para pendente, os dados de pagamento local são limpos e ele volta para conferência.</p>
              {reversalItem.asaasPaymentId ? (
                <p>Como o título anterior no {paymentGatewayLabel(reversalItem)} foi cancelado, o sistema não reativa o mesmo ID. Ele gera um novo título bancário.</p>
              ) : null}
            </div>

            {reversalItem.asaasPaymentId ? (
              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={recreateAsaas}
                  onChange={(event) => setRecreateAsaas(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span>
                  <span className="block text-xs font-black uppercase tracking-wider text-[#001a33]">Gerar nova cobrança {paymentGatewayLabel(reversalItem)}</span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">
                    Recomendado quando a baixa manual cancelou o título original no banco.
                  </span>
                </span>
              </label>
            ) : null}

            <label className="mt-5 block text-[10px] font-black uppercase text-slate-500">
              Motivo do estorno
              <textarea
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
                placeholder="Ex.: baixa lançada no aluno errado"
                className="mt-2 min-h-[92px] w-full resize-none rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-300"
              />
            </label>

            <button
              type="button"
              onClick={() => reversalMutation.mutate()}
              disabled={reversalMutation.isPending}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {reversalMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {reversalMutation.isPending ? 'Estornando...' : 'Confirmar estorno da baixa'}
            </button>
          </div>
        </div>
      ), document.body) : null}
    </>
  );
};
