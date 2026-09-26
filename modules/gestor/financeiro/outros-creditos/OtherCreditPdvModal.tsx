import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, Loader2, QrCode, ReceiptText, X } from 'lucide-react';
import type { OutrosCreditosModel } from './useOutrosCreditos';
import { formatCurrency, formatCurrencyInput, formatDate, normalizeCurrencyInput, parseCurrencyInput } from './outros-creditos.presentation';
import { PdvPartnerSearch } from './PdvPartnerSearch';

export function OtherCreditPdvModal({ model }: { model: OutrosCreditosModel }) {
  if (!model.isPdvOpen || typeof document === 'undefined') return null;
  return createPortal(<PdvForm model={model} />, document.body);
}

export function PdvForm({ model }: { model: OutrosCreditosModel }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const selected = model.partners.find(partner => partner.id === model.partnerId);
  const amount = parseCurrencyInput(model.value);
  const busy = model.createMutation.isPending;
  const complete = Boolean(selected && Number.isFinite(amount) && amount > 0 && model.dueDate && model.activePolo);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (model.partnerId) amountRef.current?.focus();
  }, [model.partnerId]);
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pdv-title"
      className="fixed inset-0 z-[140] flex h-[100dvh] flex-col overflow-y-auto bg-[#f5f7f9] text-[#001a33]"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) model.closeCreateModal();
        if (event.key !== 'Tab') return;
        const nodes = Array.from<HTMLElement>(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []).filter(node => node.getClientRects().length > 0);
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      }}>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-10">
        <div className="flex items-center gap-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#001a33] text-white"><QrCode size={23} /></span>
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Universo · PDV</p><h2 id="pdv-title" className="text-lg font-bold tracking-tight">Novo recebimento</h2></div></div>
        <button type="button" onClick={model.closeCreateModal} disabled={busy} aria-label="Fechar caixa" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40"><span className="hidden sm:inline">Fechar caixa</span><X size={20} /></button>
      </header>
      <form onSubmit={model.validateAndSubmit} className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 py-8 sm:px-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <fieldset disabled={busy} className="min-w-0 space-y-8 disabled:opacity-60">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">01 / Nova cobrança</p>
            <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Pronto para receber.</h3><p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-500">Escolha o pagador e preencha os dados. O BolePix será aberto aqui para concluir o atendimento.</p></div>
          <PdvPartnerSearch partners={model.partners} value={model.partnerId} loading={model.partnersLoading} failed={model.partnersError}
            onRetry={() => void model.retryPartners()} onSelect={(id, type) => { model.setPartnerId(id); model.setPartnerType(type); }} />
          <div className="grid gap-5 sm:grid-cols-[1.25fr_1fr]">
            <label className="block"><span className="mb-3 block text-sm font-bold text-slate-700">Valor da cobrança</span>
              <div className="flex h-[90px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
                <span className="text-lg font-bold text-slate-400">R$</span><input ref={amountRef} type="text" inputMode="decimal" required aria-label="Valor da cobrança" placeholder="0,00" value={model.value}
                  onChange={event => model.setValue(normalizeCurrencyInput(event.target.value))} onBlur={() => model.setValue(current => formatCurrencyInput(current))}
                  className="w-full min-w-0 bg-transparent text-4xl font-semibold tracking-tight outline-none placeholder:text-slate-300" /></div>
            </label>
            <label className="block"><span className="mb-3 block text-sm font-bold text-slate-700">Vencimento</span>
              <div className="relative flex h-[90px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
                <CalendarDays size={21} className="shrink-0 text-slate-400" /><input type="date" required aria-label="Vencimento" value={model.dueDate} onChange={event => model.setDueDate(event.target.value)} className={`peer min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none ${!model.dueDate ? 'text-transparent focus:text-[#001a33]' : ''}`} />
                {!model.dueDate && <span aria-hidden="true" className="pointer-events-none absolute left-12 text-sm text-slate-400 peer-focus:hidden">dd/mm/aaaa</span>}
              </div>
            </label>
          </div>
          <details className="group rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-600">Adicionar descrição e categoria <span className="font-normal text-slate-400">(opcional)</span></summary>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-slate-500">Descrição<input value={model.description} onChange={event => model.setDescription(event.target.value)} placeholder="Ex.: Segunda via de documento" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal outline-none focus:border-emerald-500" /></label>
              <label className="block text-xs font-bold text-slate-500">Categoria<select value={model.categoryId} onChange={event => model.setCategoryId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-normal"><option value="">Outras entradas</option>{model.categories.map(category => <option key={category.id} value={category.id}>{category.nome}</option>)}</select></label>
            </div>
          </details>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500"><Building2 size={16} className="shrink-0" />{model.activePolo?.nome || 'Selecione uma unidade no portal'}{model.activePolo?.cidade ? ` · ${model.activePolo.cidade}` : ''}</p>
        </fieldset>
        <aside className="flex min-w-0 flex-col">
          <div className="overflow-hidden rounded-[1.75rem] bg-[#001a33] text-white shadow-xl shadow-slate-900/10 lg:sticky lg:top-28">
            <div className="border-b border-white/10 px-7 py-6"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300"><ReceiptText size={17} /> Seu atendimento</p></div>
            <div className="space-y-7 px-7 py-7">
              <div><p className="text-xs text-slate-400">Pagador</p><p className={`mt-2 text-lg font-semibold ${selected ? 'text-white' : 'text-slate-500'}`}>{selected?.nome || 'Aguardando seleção'}</p></div>
              <div><p className="text-xs text-slate-400">Total a receber</p><p className="mt-2 break-words text-4xl font-semibold tracking-tight">{formatCurrency(amount)}</p></div>
              <div className="flex items-center justify-between gap-3 border-y border-dashed border-white/20 py-4 text-sm"><span className="text-slate-400">Vencimento</span><span className="font-semibold">{model.dueDate ? formatDate(model.dueDate) : 'A definir'}</span></div>
              <div className="flex items-center gap-3"><QrCode size={28} className="text-emerald-300" /><div><p className="text-sm font-semibold">Pix + boleto</p><p className="mt-1 text-xs text-slate-400">BolePix Banese · cobrança única</p></div></div>
              <button type="submit" disabled={!complete || busy} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-emerald-400 px-5 py-4 text-sm font-black text-[#001a33] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500">
                {busy ? <><Loader2 size={18} className="animate-spin" /> Gerando cobrança...</> : <>Gerar cobrança <ArrowRight size={18} /></>}
              </button>
              <p role="status" className="flex items-start gap-2 text-xs leading-relaxed text-slate-400"><Check size={15} className="mt-0.5 shrink-0 text-emerald-300" />{busy ? 'Aguarde a conclusão deste atendimento.' : 'Esta entrada será registrada em Outros créditos.'}</p>
            </div>
          </div>
          <button type="button" onClick={model.closeCreateModal} disabled={busy} className="mx-auto mt-5 inline-flex items-center gap-2 p-3 text-xs font-bold text-slate-500 disabled:opacity-40"><ArrowLeft size={15} /> Voltar aos lançamentos</button>
        </aside>
      </form>
    </div>
  );
}
