import React from 'react';
import TransferenciaPicker from '../transferencias/components/TransferenciaPicker';
import { maskPdvDocument } from './PdvPartnerSearch';
import type { OtherCreditPlanForm as Form } from './other-credit-plan.model';

type Partner = { id: string; nome: string; tipo: string; cpf_cnpj?: string };
type Category = { id: string; nome: string };
const inputClass = 'h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white';
const labelClass = 'block text-[10px] font-black uppercase tracking-wider text-slate-500';

export function OtherCreditPlanForm({ form, onChange, disabled, partners, categories, partnersLoading, partnersError, retryPartners }: {
  form: Form; onChange: (patch: Partial<Form>) => void; disabled: boolean;
  partners: Partner[]; categories: Category[]; partnersLoading: boolean; partnersError: boolean; retryPartners: () => void;
}) {
  return <fieldset disabled={disabled} className="min-w-0 space-y-5 disabled:opacity-70">
    <div className="grid gap-4 md:grid-cols-2">
      <TransferenciaPicker label="Pagador cadastrado" value={form.partnerId}
        options={partners.map(partner => ({ id: partner.id, label: partner.nome, detail: `${partner.tipo} · ${maskPdvDocument(partner.cpf_cnpj)}`, keywords: partner.cpf_cnpj }))}
        onChange={partnerId => onChange({ partnerId })} placeholder="Buscar nome, CPF ou CNPJ"
        loading={partnersLoading} error={partnersError} disabled={disabled} accent="emerald" />
      <TransferenciaPicker label="Categoria financeira (opcional)" value={form.categoryId}
        options={[{ id: '', label: 'Sem categoria específica', detail: 'Crédito avulso' }, ...categories.map(category => ({ id: category.id, label: category.nome, detail: 'Outros Créditos' }))]}
        onChange={categoryId => onChange({ categoryId })} placeholder="Buscar categoria" disabled={disabled} accent="emerald" />
      {partnersError ? <button type="button" onClick={retryPartners} className="text-left text-xs font-bold text-emerald-700 underline">Carregar pagadores novamente</button> : null}
      <label className="space-y-1 md:col-span-2"><span className={labelClass}>Descrição do carnê</span>
        <input value={form.description} onChange={event => onChange({ description: event.target.value })}
          placeholder="Ex.: Aulas de prática para aluna formada" maxLength={240} className={inputClass} />
      </label>
    </div>
  </fieldset>;
}
