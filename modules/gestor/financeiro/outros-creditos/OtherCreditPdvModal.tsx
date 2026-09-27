import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, Loader2, Plus, QrCode, ReceiptText, X } from 'lucide-react';
import type { OutrosCreditosModel } from './useOutrosCreditos';
import { formatCurrency, formatPdvCurrencyInput, formatDate, parseCurrencyInput } from './outros-creditos.presentation';
import { maskPdvDocument, PdvPartnerSearch } from './PdvPartnerSearch';
import CategoriaFinanceiraInlineModal from '../despesas/components/CategoriaFinanceiraInlineModal';

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
      className="fixed inset-0 z-[140] flex h-[100dvh] flex-col overflow-y-auto bg-[#f3f5f9] text-[#0b1f4a]"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) model.closeCreateModal();
        if (event.key !== 'Tab') return;
        const nodes = Array.from<HTMLElement>(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []).filter(node => node.getClientRects().length > 0);
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      }}>
      <header className="sticky top-0 z-10 border-b border-slate-200 border-t-[3px] border-t-[#ed1c24] bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-auto w-[110px] shrink-0 object-contain sm:w-[138px]" />
            <div className="min-w-0 border-l border-slate-200 pl-4 sm:pl-6"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:text-[10px]">Ponto de venda</p><h2 id="pdv-title" className="mt-0.5 text-sm font-bold tracking-tight text-[#0b1f4a] sm:text-lg">Novo recebimento</h2></div>
          </div>
          <button type="button" onClick={model.closeCreateModal} disabled={busy} aria-label="Fechar caixa" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-40"><span className="hidden sm:inline">Fechar caixa</span><X size={18} aria-hidden="true" /></button>
        </div>
      </header>
      <form onSubmit={model.validateAndSubmit} className="mx-auto grid w-full max-w-6xl content-start gap-5 px-4 py-5 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <fieldset disabled={busy} className="min-w-0 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] disabled:opacity-60 sm:p-7">
          <div className="border-b border-slate-100 pb-5"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-[#ed1c24]" aria-hidden="true" /> Dados do atendimento</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f4a] sm:text-[28px]">Prepare a cobrança</h3><p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Selecione o pagador, informe o valor e escolha o vencimento.</p></div>
          <PdvPartnerSearch partners={model.partners} value={model.partnerId} loading={model.partnersLoading} failed={model.partnersError}
            onRetry={() => void model.retryPartners()} onSelect={(id, type) => { model.setPartnerId(id); model.setPartnerType(type); }} />
          <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-600">Valor da cobrança</span>
              <div className="flex h-[72px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 transition focus-within:border-blue-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-600/10">
                <span className="text-lg font-bold text-slate-400">R$</span><input ref={amountRef} type="text" inputMode="decimal" required aria-label="Valor da cobrança" placeholder="0,00" value={model.value}
                  onChange={event => model.setValue(formatPdvCurrencyInput(event.target.value))}
                  className="w-full min-w-0 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-slate-300" /></div>
            </label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-600">Vencimento</span>
              <div className="relative flex h-[72px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 transition focus-within:border-blue-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-600/10">
                <CalendarDays size={21} className="shrink-0 text-slate-400" /><input type="date" required aria-label="Vencimento" value={model.dueDate} onChange={event => model.setDueDate(event.target.value)} className={`peer min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none ${!model.dueDate ? 'text-transparent focus:text-[#001a33]' : ''}`} />
                {!model.dueDate && <span aria-hidden="true" className="pointer-events-none absolute left-12 text-sm text-slate-400 peer-focus:hidden">dd/mm/aaaa</span>}
              </div>
            </label>
          </div>
          <details className="group rounded-xl border border-slate-200 bg-white px-4 py-4">
            <summary className="cursor-pointer rounded text-xs font-semibold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Adicionar descrição e categoria <span className="font-normal text-slate-400">(opcional)</span></summary>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-slate-500">Descrição<input value={model.description} onChange={event => model.setDescription(event.target.value)} placeholder="Ex.: Segunda via de documento" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal outline-none focus:border-blue-600" /></label>
              <div className="relative">
                <label htmlFor="pdv-category" className="block text-xs font-bold text-slate-500">Categoria</label>
                <div className="mt-2 flex gap-2">
                  <select id="pdv-category" value={model.categoryId} onChange={event => model.setCategoryId(event.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm"><option value="">Outras entradas</option>{model.categories.map(category => <option key={category.id} value={category.id}>{category.nome}</option>)}</select>
                  <button type="button" aria-label="Adicionar categoria" aria-expanded={model.showCategoryModal} onClick={() => model.setShowCategoryModal(current => !current)} className="flex h-12 items-center gap-2 rounded-xl border border-blue-200 px-4 font-bold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><Plus size={20} /><span className="hidden sm:inline">Nova</span></button>
                </div>
                {model.showCategoryModal && <CategoriaFinanceiraInlineModal tipo="OUTRO_CREDITO" accent="emerald" onClose={() => model.setShowCategoryModal(false)} onCriada={id => { model.setCategoryId(id); model.setShowCategoryModal(false); }} />}
              </div>
            </div>
          </details>
          <p className="flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500"><Building2 size={16} className="shrink-0" />{model.activePolo?.nome || 'Selecione uma unidade no portal'}{model.activePolo?.cidade ? ` · ${model.activePolo.cidade}` : ''}</p>
        </fieldset>
        <aside className="flex min-w-0 flex-col">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] lg:sticky lg:top-28">
            <div className="border-b border-[#152e5b] bg-[#0b1f4a] px-6 py-5"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white"><ReceiptText size={17} /> Seu atendimento</p></div>
            <div className="space-y-5 px-6 py-6">
              <div><p className="text-xs text-slate-500">Pagador</p><p className={`mt-1.5 break-words text-base font-semibold ${selected ? 'text-[#0b1f4a]' : 'text-slate-400'}`}>{selected?.nome || 'Aguardando seleção'}</p>{selected && <p className="mt-1 text-xs text-slate-500">{maskPdvDocument(selected.cpf_cnpj)}</p>}</div>
              <div><p className="text-xs text-slate-500">Total a receber</p><p className="mt-2 break-words text-[38px] font-semibold leading-tight tracking-[-0.045em] text-[#0b1f4a]">{formatCurrency(amount)}</p></div>
              <div className="flex items-center justify-between gap-3 border-y border-slate-100 py-4 text-sm"><span className="text-slate-500">Vencimento</span><span className="font-semibold">{model.dueDate ? formatDate(model.dueDate) : 'A definir'}</span></div>
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-800"><QrCode size={23} aria-hidden="true" /></span><div><p className="text-sm font-semibold">Pix + boleto</p><p className="mt-1 text-xs text-slate-500">BolePix Banese · cobrança única</p></div></div>
              <button type="submit" disabled={!complete || busy} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-[#0b1f4a] px-5 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#163768] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none">
                {busy ? <><Loader2 size={18} className="animate-spin" /> Gerando cobrança...</> : <>Gerar cobrança <ArrowRight size={18} /></>}
              </button>
              <p role="status" className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Check size={15} className="mt-0.5 shrink-0 text-blue-700" />{busy ? 'Aguarde a conclusão deste atendimento.' : 'Esta entrada será registrada em Outros créditos.'}</p>
            </div>
          </div>
          <button type="button" onClick={model.closeCreateModal} disabled={busy} className="mx-auto mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40"><ArrowLeft size={15} /> Voltar aos lançamentos</button>
        </aside>
      </form>
    </div>
  );
}
