import React, { useMemo } from 'react';
import { Banknote, CalendarDays, CreditCard, Landmark, Plus, ReceiptText, Smartphone, Trash2, WalletCards } from 'lucide-react';
import type { ContaBancaria } from '../financeiro.types';
import type { FinancialPaymentForm } from './useFinancialPaymentForm';
import { canonicalPaymentAmount } from './financial-payment.form';
import { todayInMaceio } from '../receber/components/manual-settlement/manual-settlement-date';
import ManualSettlementCombobox, { type ManualSettlementComboboxOption } from '../receber/components/manual-settlement/ManualSettlementCombobox';

const labelClass = 'text-[10px] font-black uppercase tracking-[0.12em] text-slate-500';
const inputClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-bold text-[#001a33] outline-none transition-all placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-100 disabled:opacity-60';
const paymentMethods: ManualSettlementComboboxOption[] = [
  { value: 'DINHEIRO', label: 'Dinheiro', description: 'Pagamento presencial em espécie', keywords: 'caixa especie', icon: <Banknote size={17} /> },
  { value: 'PIX', label: 'Pix', description: 'Transferência instantânea confirmada', keywords: 'transferencia instantanea', icon: <Smartphone size={17} /> },
  { value: 'CARTAO', label: 'Cartão', description: 'Pagamento presencial com cartão', keywords: 'credito debito maquininha', icon: <CreditCard size={17} /> },
  { value: 'BOLETO', label: 'Boleto', description: 'Título bancário já liquidado', keywords: 'linha digitavel bancario', icon: <ReceiptText size={17} /> },
];
const expenseMethods = [...paymentMethods, { value: 'TED', label: 'TED', description: 'Transferência bancária confirmada', keywords: 'transferencia banco', icon: <Landmark size={17} /> }];

// Input mask only; financial calculations remain on the server.
function maskCurrencyDigits(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  const integer = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${integer},${padded.slice(-2)}`;
}

function CurrencyField({ label, ariaLabel, value, onChange, detail, discount = false }: {
  label: string; ariaLabel: string; value: string; onChange: (value: string) => void; detail?: string; discount?: boolean;
}) {
  const canonical = canonicalPaymentAmount(value);
  const displayValue = value && canonical !== null ? maskCurrencyDigits(canonical) : value;
  return <label className="block">
    <span className={labelClass}>{label}</span>
    <span className="relative mt-1.5 block">
      <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black ${discount ? 'text-emerald-600' : 'text-slate-400'}`}>R$</span>
      <input aria-label={ariaLabel} type="text" inputMode="numeric" value={displayValue} placeholder="0,00"
        onFocus={event => event.currentTarget.select()} onChange={event => onChange(maskCurrencyDigits(event.target.value))}
        className={`${inputClass} font-black ${discount ? 'border-emerald-200' : ''}`} />
    </span>
    {detail ? <span className="mt-1 block text-[10px] font-medium text-slate-400">{detail}</span> : null}
  </label>;
}

export function FinancialPaymentEditor({ form, accounts, expense }: { form: FinancialPaymentForm; accounts: ContaBancaria[]; expense: boolean }) {
  const disabled = form.locked || form.loading;
  const accountOptions = useMemo<ManualSettlementComboboxOption[]>(() => accounts
    .filter((account): account is ContaBancaria & { id: string } => Boolean(account.id))
    .map(account => ({
      value: account.id,
      label: `${account.banco} · ${account.conta}`,
      description: account.natureza === 'CAIXA_INTERNO' ? `Caixa interno · ${account.titular}` : `Ag. ${account.agencia} · ${account.titular}`,
      keywords: [account.banco, account.conta, account.agencia, account.titular, account.poloNome].filter(Boolean).join(' '),
      icon: account.natureza === 'CAIXA_INTERNO' ? <WalletCards size={17} /> : <Landmark size={17} />,
    })), [accounts]);
  const setComponent = (index: number, field: 'accountId' | 'method' | 'amount', value: string) => {
    if (field === 'amount') { form.setPaymentAmount(index, value); return; }
    form.setDraft(current => ({ ...current,
      components: current.components.map((component, row) => row === index ? { ...component, [field]: value } : component) }));
  };

  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-black text-[#001a33]">{expense ? 'Dados do pagamento' : 'Dados do recebimento'}</h3>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">Informe a origem, a data e somente os ajustes aplicados.</p>
      </div>
      <span className="hidden shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500 sm:inline-flex">Servidor valida</span>
    </div>

    <div className="space-y-4">
      {form.draft.components.map((component, index) => <div key={index} role="group" aria-label={`Pagamento ${index + 1}`}
        className={index > 0 ? 'border-t border-slate-200 pt-4' : ''}>
        {form.draft.components.length > 1 ? <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-black text-[#001a33]">Pagamento {index + 1}</p>
          <button type="button" aria-label={`Remover pagamento ${index + 1}`} disabled={disabled}
            onClick={() => { form.disableAutomaticAmount(); form.setDraft(current => ({ ...current, components: current.components.filter((_item, row) => row !== index) })); }}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 size={15} /></button>
        </div> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ManualSettlementCombobox label="Conta bancária / caixa" value={component.accountId} options={accountOptions}
              onChange={value => setComponent(index, 'accountId', value)} placeholder="Busque ou selecione a conta"
              emptyMessage={accountOptions.length ? 'Nenhuma conta corresponde à busca' : 'Nenhuma conta ativa disponível'} disabled={disabled} />
          </div>
          <ManualSettlementCombobox label="Forma de pagamento" value={component.method} options={expense ? expenseMethods : paymentMethods}
            onChange={value => setComponent(index, 'method', value)} placeholder="Busque a forma de pagamento"
            emptyMessage="Nenhuma forma de pagamento encontrada" disabled={disabled} />
          {index === 0 ? <label className="block">
            <span className={labelClass}>Data do pagamento <span aria-hidden="true" className="text-emerald-600">*</span></span>
            <span className="relative mt-1.5 block">
              <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input aria-label="Data do pagamento" aria-required="true" type="date" max={todayInMaceio()} value={form.draft.paymentDate}
                onChange={event => form.setDraft(current => ({ ...current, paymentDate: event.target.value }))} className={inputClass} />
            </span>
          </label> : <CurrencyField label={expense ? 'Valor pago nesta forma' : 'Valor recebido nesta forma'} ariaLabel={`Valor do pagamento ${index + 1}`}
            value={component.amount} onChange={value => setComponent(index, 'amount', value)} />}
          {index === 0 ? <div className="sm:col-span-2">
            <CurrencyField label={expense ? 'Valor pago nesta forma' : 'Valor recebido nesta forma'} ariaLabel="Valor do pagamento 1"
              value={component.amount} onChange={value => setComponent(index, 'amount', value)}
              detail="Para uma baixa parcial, informe somente o valor pago agora." />
          </div> : null}
        </div>
      </div>)}
      <button type="button" disabled={disabled || form.draft.components.length >= 10}
        onClick={() => { form.disableAutomaticAmount(); form.setDraft(current => ({ ...current, components: [...current.components, { accountId: '', method: 'PIX', amount: '' }] })); }}
        className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
        <Plus size={15} /> Adicionar forma de pagamento
      </button>
    </div>

    <section aria-label="Ajustes desta baixa" className="border-t border-slate-200 pt-4">
      <div className="mb-3">
        <h4 className="text-xs font-black text-[#001a33]">Ajustes desta baixa</h4>
        <p className="mt-0.5 text-[10px] font-medium text-slate-500">Cada alteração atualiza a composição e o saldo desta baixa.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CurrencyField label={expense ? 'Juros pagos' : 'Juros recebidos'} ariaLabel="Juros" value={form.draft.interest}
          onChange={value => form.setDraft(current => ({ ...current, interest: value }))} detail="Juros incluídos no valor informado" />
        <CurrencyField label={expense ? 'Multa paga' : 'Multa recebida'} ariaLabel="Multa" value={form.draft.penalty}
          onChange={value => form.setDraft(current => ({ ...current, penalty: value }))} detail="Multa incluída no valor informado" />
        <CurrencyField label={expense ? 'Desconto obtido' : 'Desconto concedido'} ariaLabel="Desconto" value={form.draft.discount}
          onChange={value => form.setDraft(current => ({ ...current, discount: value }))} detail="Aplicado ao saldo desta baixa" discount />
        <CurrencyField label="Outros acréscimos" ariaLabel="Outros acréscimos" value={form.draft.addition}
          onChange={value => form.setDraft(current => ({ ...current, addition: value }))} detail="Acréscimos incluídos no valor informado" />
      </div>
    </section>

    <label className="block">
      <span className={labelClass}>Observação</span>
      <textarea aria-label="Observação do pagamento" rows={2} maxLength={1000} value={form.draft.notes}
        onChange={event => form.setDraft(current => ({ ...current, notes: event.target.value }))}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-[#001a33] outline-none transition-all focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-100 disabled:opacity-60" />
    </label>
  </fieldset>;
}
