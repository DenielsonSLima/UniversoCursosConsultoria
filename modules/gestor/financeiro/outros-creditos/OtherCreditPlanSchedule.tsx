import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatCurrencyInput, normalizeCurrencyInput } from './outros-creditos.presentation';
import type { OtherCreditPlanForm } from './other-credit-plan.model';
import type { OtherCreditPlanPreview } from './other-credit-plan.types';

export function OtherCreditPlanSchedule({ form, schedule, current, pending, disabled, onChange, onRefresh }: {
  form: OtherCreditPlanForm; schedule: OtherCreditPlanPreview | null; current: boolean; pending: boolean;
  disabled: boolean; onChange: (patch: Partial<OtherCreditPlanForm>) => void; onRefresh: () => void;
}) {
  const changeInstallment = (number: number, patch: { value?: string; dueDate?: string }) => {
    if (!schedule) return;
    const installments = form.installments.length ? form.installments : schedule.parcelas
      .filter(item => item.papel === 'PARCELA').map(item => ({
        number: item.numero, value: item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), dueDate: item.dataVencimento,
      }));
    onChange({ installments: installments.map(item => item.number === number ? { ...item, ...patch } : item) });
  };
  return <section aria-label="Parcelas editáveis" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-black text-[#001a33]">Cronograma financeiro</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Altere o valor ou o vencimento de cada cobrança abaixo.</p>
      </div>
      <button type="button" onClick={onRefresh} disabled={disabled || pending}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-50">
        {pending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {pending ? 'Calculando parcelas' : 'Atualizar parcelas'}
      </button>
    </div>
    {!schedule ? <p role="status" className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
      {pending ? 'Montando o cronograma...' : 'Informe o valor, a quantidade e o primeiro vencimento para listar as parcelas.'}
    </p> : <>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>
            {['Cobrança', 'Valor (R$)', 'Vencimento'].map(label => <th key={label} className="px-4 py-3 font-black">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{schedule.parcelas.map(item => {
            const name = item.papel === 'PARCELA' ? `Parcela ${item.numero}/${schedule.quantidadeParcelas}` : item.papel === 'MATRICULA' ? 'Matrícula' : 'Rematrícula';
            const override = form.installments.find(row => row.number === item.numero);
            const fee = item.papel === 'MATRICULA' ? 'enrollment' : 'reenrollment';
            if (item.papel !== 'PARCELA' && !form[fee].enabled) return null;
            const value = item.papel === 'PARCELA' ? override?.value ?? item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : form[fee].value;
            const dueDate = item.papel === 'PARCELA' ? override?.dueDate ?? item.dataVencimento : form[fee].dueDate;
            const change = (patch: { value?: string; dueDate?: string }) => item.papel === 'PARCELA'
              ? changeInstallment(item.numero, patch) : onChange({ [fee]: { ...form[fee], ...patch } });
            const inputClass = 'h-11 w-full min-w-32 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400';
            return <tr key={item.ordem}>
              <td className="px-4 py-3 font-bold text-[#001a33]">{name}</td>
              <td className="px-4 py-3"><input aria-label={`Valor de ${name}`} type="text" inputMode="decimal" value={value}
                onChange={event => change({ value: normalizeCurrencyInput(event.target.value) })}
                onBlur={() => change({ value: formatCurrencyInput(value) })} className={inputClass} /></td>
              <td className="px-4 py-3"><input aria-label={`Vencimento de ${name}`} type="date" value={dueDate}
                onChange={event => change({ dueDate: event.target.value })} className={inputClass} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p role="status" aria-live="polite" className="text-xs leading-5 text-slate-500">
        {pending ? 'Recalculando o cronograma...' : current ? 'Cronograma atualizado. Os totais serão conferidos na revisão.' : 'Há ajustes aguardando recálculo antes da revisão.'}
      </p>
    </>}
  </section>;
}
