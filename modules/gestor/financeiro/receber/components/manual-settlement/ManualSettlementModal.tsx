import React from 'react';
import { CheckCircle2, Loader2, WalletCards, X } from 'lucide-react';
import type { ContaBancaria, ContasReceber } from '../../../financeiro.service';
import {
  sanitizeCurrencyInput,
  useManualSettlementForm,
  type ManualSettlementPayload,
} from './useManualSettlementForm';

interface ManualSettlementModalProps {
  receivable: ContasReceber;
  accounts: ContaBancaria[];
  initialAccountId?: string;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (payload: ManualSettlementPayload) => void;
}

const CurrencyField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder = '0,00' }) => (
  <label className="text-[10px] font-black uppercase text-slate-500">
    {label}
    <div className="relative mt-2">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(sanitizeCurrencyInput(event.target.value))}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 p-3 pl-10 text-xs font-bold text-slate-700"
      />
    </div>
  </label>
);

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value || 0));

const hasRemoteCharge = (receivable: ContasReceber) => Boolean(
  receivable.gatewayProvider
  || receivable.asaasPaymentId
  || receivable.asaasPaymentLinkId,
);

export const ManualSettlementModal: React.FC<ManualSettlementModalProps> = ({
  receivable,
  accounts,
  initialAccountId = '',
  pending,
  error,
  onClose,
  onConfirm,
}) => {
  const form = useManualSettlementForm(receivable.valor, initialAccountId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex min-h-screen w-full items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl rounded-[2rem] bg-white p-7 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
        >
          <X size={18} />
        </button>
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><WalletCards size={22} /></div>
          <div>
            <h5 className="font-black uppercase text-[#001a33]">Confirmar recebimento</h5>
            <p className="text-xs text-slate-500">{receivable.clienteNome} · {receivable.descricao}</p>
          </div>
        </div>

        {receivable.tipoLancamento === 'MATRICULA' && (
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold text-blue-800">
            Ao confirmar esta matrícula, o sistema criará as parcelas futuras conforme o cronograma e a rota bancária configurada.
          </div>
        )}

        {hasRemoteCharge(receivable) && (
          <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
            A baixa local só será consolidada depois que a integração bancária confirmar que o título deixou de aceitar pagamento. Se houver dúvida no retorno, a operação ficará bloqueada para revisão.
          </div>
        )}

        <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-semibold text-slate-600">
          Valor principal da parcela: <strong className="text-[#001a33]">{formatCurrency(receivable.valor)}</strong>. Informe separadamente juros, multa, desconto e outros acréscimos. O servidor validará a composição exata antes da baixa.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-[10px] font-black uppercase text-slate-500">
            Conta bancária / caixa
            <select
              value={form.accountId}
              onChange={(event) => form.setAccountId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700"
            >
              <option value="">Selecione...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.banco} · {account.conta}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Forma de pagamento
            <select
              value={form.paymentMethod}
              onChange={(event) => form.setPaymentMethod(event.target.value as typeof form.paymentMethod)}
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700"
            >
              <option value="DINHEIRO">Dinheiro</option>
              <option value="PIX">Pix</option>
              <option value="CARTAO">Cartão</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Data do pagamento
            <input
              type="date"
              value={form.paymentDate}
              onChange={(event) => form.setPaymentDate(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700"
            />
          </label>
          <CurrencyField label="Valor recebido" value={form.receivedValue} onChange={form.setReceivedValue} />
          <CurrencyField label="Juros recebidos" value={form.interestValue} onChange={form.setInterestValue} />
          <CurrencyField label="Multa recebida" value={form.penaltyValue} onChange={form.setPenaltyValue} />
          <CurrencyField label="Desconto concedido" value={form.discountValue} onChange={form.setDiscountValue} />
          <CurrencyField label="Outros acréscimos" value={form.additionValue} onChange={form.setAdditionValue} />
        </div>

        {!accounts.length && (
          <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold text-amber-700">
            Nenhuma conta ativa foi encontrada para este polo. Cadastre uma conta do polo ou global antes da baixa.
          </p>
        )}

        {error && <p className="mt-4 text-xs font-bold text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={() => onConfirm(form.payload)}
          disabled={!form.canSubmit || pending}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
          {pending ? 'Confirmando...' : 'Confirmar e registrar'}
        </button>
      </div>
    </div>
  );
};

export default ManualSettlementModal;
