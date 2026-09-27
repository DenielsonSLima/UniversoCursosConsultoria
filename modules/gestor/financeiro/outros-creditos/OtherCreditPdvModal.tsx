import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, Banknote, CalendarDays, Check, ChevronDown,
  CircleCheckBig, Landmark, Loader2, LockKeyhole, Plus, QrCode, ReceiptText,
  ShieldCheck, UserRound, X,
} from 'lucide-react';
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
  const hasAmount = Number.isFinite(amount) && amount > 0;
  const complete = Boolean(selected && hasAmount && model.dueDate && model.activePolo);
  const poloLocation = [model.activePolo?.cidade, model.activePolo?.estado || model.activePolo?.uf].filter(Boolean).join('/');

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

  const progress = selected ? (hasAmount && model.dueDate ? 3 : 2) : 1;
  const steps = [
    { number: 1, label: 'Pagador' },
    { number: 2, label: 'Cobrança' },
    { number: 3, label: 'Revisão' },
  ];

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pdv-title"
      className="fixed inset-0 z-[140] h-[100dvh] overflow-y-auto bg-[#eef2f7] text-[#071b3f] selection:bg-blue-200"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) model.closeCreateModal();
        if (event.key !== 'Tab') return;
        const nodes = Array.from<HTMLElement>(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []).filter(node => node.getClientRects().length > 0);
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-[246px] bg-[#071b3f]" />
        <div className="absolute -right-28 -top-8 h-[360px] w-[360px] rounded-full bg-blue-500/20 blur-[100px]" />
        <div className="absolute left-[8%] top-36 h-40 w-40 rounded-full bg-[#ed1c24]/10 blur-[70px]" />
        <div className="absolute inset-x-0 top-[245px] h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent" />
      </div>

      <header className="sticky top-0 z-30 border-t-[3px] border-t-[#ed1c24] bg-[#071b3f]/90 text-white shadow-lg shadow-slate-950/10 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[78px] max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
            <span className="flex h-11 w-[124px] shrink-0 items-center justify-center rounded-xl bg-white px-3 shadow-sm sm:h-12 sm:w-[154px]">
              <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-auto w-full object-contain" />
            </span>
            <div className="min-w-0 border-l border-white/15 pl-4 sm:pl-6">
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.22em] text-blue-200 sm:text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#ed1c24] shadow-[0_0_0_4px_rgba(237,28,36,0.14)]" /> Ponto de venda</p>
              <h2 id="pdv-title" className="mt-1 truncate text-sm font-bold tracking-tight sm:text-lg">Novo recebimento</h2>
            </div>
            <div className="hidden min-w-0 max-w-sm border-l border-white/15 pl-6 md:block">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                {model.activePolo?.nome || 'Unidade não selecionada'}{model.activePolo?.cidade ? ` · ${model.activePolo.cidade}` : ''}
              </p>
              <p className="mt-1 truncate text-[10px] font-medium tracking-wide text-blue-200/60">CNPJ {model.activePolo?.cnpj || 'não informado'}</p>
            </div>
          </div>
          <button type="button" onClick={model.closeCreateModal} disabled={busy} aria-label="Fechar caixa"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b3f] disabled:opacity-40 sm:px-4">
            <span className="hidden sm:inline">Fechar caixa</span><X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <form onSubmit={model.validateAndSubmit} className="relative z-10 mx-auto grid w-full max-w-7xl content-start gap-x-7 px-4 pb-8 pt-4 sm:px-8 sm:pt-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-10">
        <div className="mb-4 lg:col-span-2 lg:flex lg:justify-end">
          <nav aria-label="Etapas do recebimento" className="w-full rounded-2xl border border-white/10 bg-white/[0.07] p-2.5 backdrop-blur-md lg:w-[380px]">
            <ol className="grid grid-cols-3 gap-2">
              {steps.map(step => {
                const done = progress > step.number;
                const active = progress === step.number;
                return <li key={step.number} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 transition ${active ? 'bg-white text-[#071b3f] shadow-lg shadow-slate-950/10' : 'text-blue-100/60'}`}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${done ? 'bg-emerald-400 text-[#071b3f]' : active ? 'bg-[#ed1c24] text-white' : 'border border-white/20 bg-white/5'}`}>{done ? <Check size={13} strokeWidth={3} /> : step.number}</span>
                  <span className="truncate text-[10px] font-bold uppercase tracking-wide">{step.label}</span>
                </li>;
              })}
            </ol>
          </nav>
        </div>

        <fieldset disabled={busy} className="min-w-0 space-y-5 rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_70px_-28px_rgba(7,27,63,0.35)] disabled:opacity-60 sm:p-7 lg:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-[#ed1c24]" aria-hidden="true" /> Dados do atendimento</p>
              <h4 className="mt-2 text-2xl font-black tracking-[-0.025em] text-[#071b3f] sm:text-[30px]">Prepare a cobrança</h4>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Preencha os dados essenciais. O resumo ao lado acompanha cada escolha.</p>
            </div>
            <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-800 sm:grid"><ReceiptText size={22} /></span>
          </div>

          <section aria-labelledby="payer-section-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#071b3f] text-xs font-black text-white">1</span>
                <div><h5 id="payer-section-title" className="text-sm font-bold text-[#071b3f]">Identifique o pagador</h5><p className="mt-0.5 text-[11px] text-slate-400">Aluno, professor ou parceiro cadastrado</p></div>
              </div>
              {selected && <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 sm:inline-flex"><CircleCheckBig size={13} /> Selecionado</span>}
            </div>
            <PdvPartnerSearch partners={model.partners} value={model.partnerId} loading={model.partnersLoading} failed={model.partnersError}
              location={poloLocation} onRetry={() => void model.retryPartners()} onSelect={(id, type) => { model.setPartnerId(id); model.setPartnerType(type); }} />
          </section>

          <section aria-labelledby="charge-section-title">
            <div className="mb-3 flex items-center gap-3">
              <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${selected ? 'bg-[#071b3f] text-white' : 'bg-slate-100 text-slate-400'}`}>2</span>
              <div><h5 id="charge-section-title" className="text-sm font-bold text-[#071b3f]">Defina a cobrança</h5><p className="mt-0.5 text-[11px] text-slate-400">Valor e data de vencimento</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1.22fr_1fr]">
              <label className="group block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Valor a receber</span>
                <div className="flex h-[88px] items-center gap-3 rounded-2xl border border-slate-200 bg-[#f7f9fc] px-5 transition-all group-focus-within:-translate-y-0.5 group-focus-within:border-blue-500 group-focus-within:bg-white group-focus-within:shadow-[0_14px_34px_-18px_rgba(37,99,235,0.55)] group-focus-within:ring-4 group-focus-within:ring-blue-500/10">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sm font-black text-blue-800 shadow-sm">R$</span>
                  <input ref={amountRef} type="text" inputMode="decimal" required aria-label="Valor da cobrança" placeholder="0,00" value={model.value}
                    onChange={event => model.setValue(formatPdvCurrencyInput(event.target.value))}
                    className="w-full min-w-0 bg-transparent text-3xl font-black tracking-[-0.04em] text-[#071b3f] outline-none placeholder:text-slate-300 sm:text-[34px]" />
                </div>
              </label>
              <label className="group block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Vencimento</span>
                <div className="relative flex h-[88px] items-center gap-3 rounded-2xl border border-slate-200 bg-[#f7f9fc] px-4 transition-all group-focus-within:-translate-y-0.5 group-focus-within:border-blue-500 group-focus-within:bg-white group-focus-within:shadow-[0_14px_34px_-18px_rgba(37,99,235,0.55)] group-focus-within:ring-4 group-focus-within:ring-blue-500/10">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-800 shadow-sm"><CalendarDays size={20} /></span>
                  <input type="date" required aria-label="Vencimento" value={model.dueDate} onChange={event => model.setDueDate(event.target.value)} className={`peer min-w-0 flex-1 bg-transparent text-sm font-bold outline-none ${!model.dueDate ? 'text-transparent focus:text-[#071b3f]' : ''}`} />
                  {!model.dueDate && <span aria-hidden="true" className="pointer-events-none absolute left-[4.25rem] text-sm text-slate-400 peer-focus:hidden">dd/mm/aaaa</span>}
                </div>
              </label>
            </div>
          </section>

          <details className="group rounded-2xl border border-slate-200 bg-[#fafbfc] px-5 py-4 transition open:bg-white open:shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded text-xs font-bold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2"><Plus size={16} className="text-blue-700 transition group-open:rotate-45" /> Adicionar descrição e categoria <span className="hidden font-normal text-slate-400 sm:inline">(opcional)</span></span>
              <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
              <label className="block text-xs font-bold text-slate-500">Descrição<input value={model.description} onChange={event => model.setDescription(event.target.value)} placeholder="Ex.: Segunda via de documento" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10" /></label>
              <div className="relative">
                <label htmlFor="pdv-category" className="block text-xs font-bold text-slate-500">Categoria</label>
                <div className="mt-2 flex gap-2">
                  <select id="pdv-category" value={model.categoryId} onChange={event => model.setCategoryId(event.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-600"><option value="">Outras entradas</option>{model.categories.map(category => <option key={category.id} value={category.id}>{category.nome}</option>)}</select>
                  <button type="button" aria-label="Adicionar categoria" aria-expanded={model.showCategoryModal} onClick={() => model.setShowCategoryModal(current => !current)} className="flex h-12 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 font-bold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><Plus size={18} /><span className="hidden sm:inline">Nova</span></button>
                </div>
                {model.showCategoryModal && <CategoriaFinanceiraInlineModal tipo="OUTRO_CREDITO" accent="emerald" onClose={() => model.setShowCategoryModal(false)} onCriada={id => { model.setCategoryId(id); model.setShowCategoryModal(false); }} />}
              </div>
            </div>
          </details>

        </fieldset>

        <aside className="mt-6 flex min-w-0 flex-col lg:mt-0">
          <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-[#071b3f] text-white shadow-[0_26px_70px_-28px_rgba(7,27,63,0.72)] lg:sticky lg:top-28">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/25 blur-[70px]" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-[#ed1c24]/10 blur-[70px]" aria-hidden="true" />
            <div className="relative border-b border-white/10 px-6 py-5 sm:px-7">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-100"><ReceiptText size={17} className="text-[#ff5960]" /> Resumo ao vivo</p>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Seguro</span>
              </div>
            </div>

            <div className="relative space-y-6 px-6 py-7 sm:px-7">
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${selected ? 'border-blue-300/20 bg-blue-300/10 text-blue-200' : 'border-white/10 bg-white/5 text-white/30'}`}><UserRound size={21} /></span>
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/55">Pagador</p><p className={`mt-1 break-words text-base font-bold leading-snug ${selected ? 'text-white' : 'text-white/35'}`}>{selected?.nome || 'Aguardando seleção'}</p>{selected && <p className="mt-1 text-xs text-blue-100/55">{maskPdvDocument(selected.cpf_cnpj)}</p>}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-inner shadow-black/10">
                <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/55">Total a receber</p><Banknote size={17} className="text-emerald-300" /></div>
                <p className={`mt-3 break-words text-[42px] font-black leading-none tracking-[-0.055em] sm:text-[46px] ${hasAmount ? 'text-white' : 'text-white/25'}`}>{formatCurrency(amount)}</p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-dashed border-white/15 pt-4 text-sm"><span className="text-blue-100/55">Vencimento</span><span className={`font-bold ${model.dueDate ? 'text-white' : 'text-white/35'}`}>{model.dueDate ? formatDate(model.dueDate) : 'A definir'}</span></div>
              </div>

              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-blue-900 shadow-lg shadow-black/10"><QrCode size={25} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-sm font-bold">Pix + boleto</p><span className="rounded bg-emerald-300/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-200">BolePix</span></div><p className="mt-1 text-xs text-blue-100/55">Banese · cobrança única</p></div>
                <Landmark size={18} className="text-blue-200/45" />
              </div>

              <button type="submit" disabled={!complete || busy}
                className="group flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl bg-[#ed1c24] px-5 py-4 text-sm font-black text-white shadow-[0_16px_34px_-16px_rgba(237,28,36,0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#ff3038] hover:shadow-[0_20px_38px_-16px_rgba(237,28,36,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b3f] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none">
                {busy ? <><span className="flex items-center gap-3"><Loader2 size={18} className="animate-spin" /> Gerando cobrança...</span></> : <><span className="flex items-center gap-3"><ShieldCheck size={19} /> Gerar cobrança</span><ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></>}
              </button>

              <p role="status" className="flex items-start gap-2.5 text-[11px] leading-5 text-blue-100/55"><LockKeyhole size={14} className="mt-0.5 shrink-0 text-emerald-300" />{busy ? 'Aguarde a conclusão deste atendimento.' : complete ? 'Tudo pronto. Confira os dados e gere a cobrança com segurança.' : 'Complete os dados para liberar a emissão da cobrança.'}</p>
            </div>

            <div className="relative flex items-center justify-center gap-2 border-t border-white/10 bg-black/10 px-6 py-3.5 text-[9px] font-bold uppercase tracking-[0.16em] text-blue-100/40"><Check size={12} className="text-emerald-300" /> Registro em Outros créditos</div>
          </div>
          <button type="button" onClick={model.closeCreateModal} disabled={busy} className="mx-auto mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:text-[#071b3f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40"><ArrowLeft size={15} /> Voltar aos lançamentos</button>
        </aside>
      </form>
    </div>
  );
}
