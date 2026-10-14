import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ContaBancaria } from '../financeiro.types';
import type { FinancialPaymentForm } from './useFinancialPaymentForm';
import type { FinancialPaymentMethod } from './financial-payment.types';
import { todayInMaceio } from '../receber/components/manual-settlement/manual-settlement-date';

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50';
export function FinancialPaymentEditor({ form, accounts, expense }: { form: FinancialPaymentForm; accounts: ContaBancaria[]; expense: boolean }) {
  const setComponent = (index: number, field: 'accountId' | 'method' | 'amount', value: string) => form.setDraft(current => ({ ...current,
    components: current.components.map((component, row) => row === index ? { ...component, [field]: value } : component) }));
  const methods = expense ? ['DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'TED'] : ['DINHEIRO', 'PIX', 'CARTAO', 'BOLETO'];
  return <fieldset disabled={form.locked || form.loading} className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 className="text-sm font-black text-[#001a33]">{expense ? 'Como foi pago' : 'Como foi recebido'}</h3>
        <p className="mt-1 text-xs text-slate-500">Informe os valores de cada forma. Você pode registrar apenas uma parte do saldo.</p></div>
      <label className="text-xs font-bold text-slate-600">Data do pagamento
        <input aria-label="Data do pagamento" type="date" max={todayInMaceio()} value={form.draft.paymentDate}
          onChange={event => form.setDraft(current => ({ ...current, paymentDate: event.target.value }))} className={inputClass} /></label>
    </div>
    <div className="space-y-3">
      {form.draft.components.map((component, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between"><p className="text-xs font-black text-slate-600">Pagamento {index + 1}</p>
          {form.draft.components.length > 1 ? <button type="button" aria-label={`Remover pagamento ${index + 1}`}
            onClick={() => form.setDraft(current => ({ ...current, components: current.components.filter((_item, row) => row !== index) }))}
            className="rounded-lg p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Trash2 size={15} /></button> : null}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Valor (R$)
            <input aria-label={`Valor do pagamento ${index + 1}`} inputMode="decimal" value={component.amount} placeholder="0,00"
              onChange={event => setComponent(index, 'amount', event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-bold text-slate-600">Forma de pagamento
            <select aria-label={`Forma do pagamento ${index + 1}`} value={component.method}
              onChange={event => setComponent(index, 'method', event.target.value as FinancialPaymentMethod)} className={inputClass}>
              {methods.map(method => <option key={method} value={method}>{method === 'CARTAO' ? 'Cartão' : method === 'DINHEIRO' ? 'Dinheiro' : method}</option>)}
            </select></label>
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">Conta bancária / caixa
            <select aria-label={`Conta do pagamento ${index + 1}`} value={component.accountId}
              onChange={event => setComponent(index, 'accountId', event.target.value)} className={inputClass}>
              <option value="">Selecione a conta</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.banco} · {account.conta} · {account.titular}</option>)}
            </select></label>
        </div>
      </div>)}
      <button type="button" disabled={form.locked || form.draft.components.length >= 10}
        onClick={() => form.setDraft(current => ({ ...current, components: [...current.components, { accountId: '', method: 'PIX', amount: '' }] }))}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-3 text-xs font-black text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"><Plus size={16} /> Adicionar forma de pagamento</button>
    </div>
    <details className="rounded-2xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-bold text-slate-700">Juros, multa, acréscimos e desconto</summary>
      <p className="mt-2 text-xs text-slate-500">Informe apenas os ajustes desta baixa. O saldo não pago continuará em aberto.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{([
        ['interest', 'Juros'], ['penalty', 'Multa'], ['addition', 'Outros acréscimos'], ['discount', 'Desconto'],
      ] as const).map(([key, label]) => <label key={key} className="text-xs font-bold text-slate-600">{label} (R$)
        <input aria-label={label} inputMode="decimal" value={form.draft[key]} placeholder="0,00"
          onChange={event => form.setDraft(current => ({ ...current, [key]: event.target.value }))} className={inputClass} /></label>)}</div>
    </details>
    <label className="block text-xs font-bold text-slate-600">Observação
      <textarea aria-label="Observação do pagamento" rows={2} maxLength={1000} value={form.draft.notes}
        onChange={event => form.setDraft(current => ({ ...current, notes: event.target.value }))} className={inputClass} /></label>
  </fieldset>;
}
