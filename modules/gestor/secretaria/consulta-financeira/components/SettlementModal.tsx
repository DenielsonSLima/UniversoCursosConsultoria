import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import { Loader2, ReceiptText, X } from 'lucide-react';
import type { SecretariaSettlementController } from '../hooks/useSecretariaSettlement';
import type { PaymentMethod } from '../secretaria-financeira.types';

const SettlementModal = ({
  controller,
}: {
  controller: SecretariaSettlementController;
}) => {
  if (!controller.selected) return null;

  const { form, selected } = controller;
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">
              Baixa manual
            </p>
            <h3 className="mt-1 text-xl font-black text-[#001a33]">Confirmar recebimento</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {selected.alunoNome} · {selected.descricao}
            </p>
          </div>
          <button
            type="button"
            onClick={controller.close}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Conta de recebimento
            </span>
            <InstitutionalSelect
              ariaLabel="Conta de recebimento"
              value={form.accountId}
              onValueChange={(value) => controller.setField('accountId', value)}
              options={[{ value: '', label: 'Selecione a conta' }, ...controller.accounts.map((conta) => ({
                value: conta.id, label: `${conta.banco} · Ag. ${conta.agencia} · ${conta.conta}`,
              }))]}
              className="mt-1.5 w-full"
            />
          </label>
          <label>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Forma de pagamento
            </span>
            <InstitutionalSelect
              ariaLabel="Forma de pagamento"
              value={form.paymentMethod}
              onValueChange={(value) => controller.setField('paymentMethod', value as PaymentMethod)}
              options={[{ value: 'DINHEIRO', label: 'Dinheiro' }, { value: 'PIX', label: 'Pix' }, { value: 'CARTAO', label: 'Cartão' }, { value: 'BOLETO', label: 'Boleto' }]}
              className="mt-1.5 w-full"
            />
          </label>
          <label>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Data do recebimento
            </span>
            <input
              type="date"
              value={form.paymentDate}
              onChange={(event) => controller.setField('paymentDate', event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Valor recebido
            </span>
            <input
              value={form.paidValue}
              onChange={(event) => controller.setField('paidValue', event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-cyan-400"
            />
          </label>
          <FinancialValueInput
            label="Juros recebidos"
            value={form.interestValue}
            onChange={(value) => controller.setField('interestValue', value)}
          />
          <FinancialValueInput
            label="Multa recebida"
            value={form.penaltyValue}
            onChange={(value) => controller.setField('penaltyValue', value)}
          />
          <FinancialValueInput
            label="Desconto concedido"
            value={form.discountValue}
            onChange={(value) => controller.setField('discountValue', value)}
          />
          <FinancialValueInput
            label="Outros acréscimos"
            value={form.additionValue}
            onChange={(value) => controller.setField('additionValue', value)}
          />
        </div>

        <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
          O servidor confere principal + juros + multa + acréscimos − desconto. A tela não consolida cálculos financeiros.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={controller.close}
            className="rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={controller.confirmDisabled}
            onClick={() => controller.confirm()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {controller.isPending
              ? <Loader2 className="animate-spin" size={15} />
              : <ReceiptText size={15} />}
            Confirmar baixa
          </button>
        </div>
      </div>
    </div>
  );
};

const FinancialValueInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label>
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
      {label}
    </span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="0,00"
      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-cyan-400"
    />
  </label>
);

export default SettlementModal;
