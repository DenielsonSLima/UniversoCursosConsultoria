import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Download, Landmark, Loader2, RefreshCw, X } from 'lucide-react';
import type { OutrosCreditosModel } from './useOutrosCreditos';
import type { OtherCreditPlanModel } from './useOtherCreditPlan';
import { OtherCreditPlanWizard } from './OtherCreditPlanWizard';
import { OtherCreditPlanPreview } from './OtherCreditPlanPreview';

type Resources = Pick<OutrosCreditosModel, 'partners' | 'categories' | 'activePolo' | 'partnersLoading' | 'partnersError' | 'retryPartners'>;
const buttonClass = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-50 disabled:opacity-50';

export function OtherCreditPlanContent({ model, resources }: { model: OtherCreditPlanModel; resources: Resources }) {
  const shownPreview = model.planId ? model.plan?.plano.preview : model.preview;
  const customerName = model.plan?.plano.cliente_nome || resources.partners.find(partner => partner.id === model.plan?.plano.cliente_id)?.nome;
  const canDownload = model.issuedCount > 0 && !model.pendingCount && !model.needsReview && !model.hasLocalBalance;
  return <div className="space-y-5">
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
      <strong>{resources.activePolo?.nome || 'Unidade atual'}</strong> · Cobrança avulsa para aulas de prática ou outros serviços.
    </div>
    {model.message ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium leading-6 text-amber-900">{model.message}</p> : null}
    {model.planId ? <>
      {model.planLoading ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} /> Carregando carnê...</p> : null}
      {model.planError ? <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{model.planError}</p> : null}
      {model.plan ? <div>
        <h3 className="text-lg font-black text-[#001a33]">{model.plan.plano.descricao}</h3>
        <p className="mt-1 text-sm text-slate-500">{customerName || 'Pagador cadastrado'} · {model.plan.plano.input.quantidadeParcelas} parcela(s) · {model.plan.plano.input.periodicidade === 'DIAS_CORRIDOS_30' ? 'A cada 30 dias' : 'Mensal'}</p>
      </div> : null}
      {model.hasLocalBalance ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-900">Este carnê inclui uma parcela com saldo local após recebimento. O saldo continua em Outros Créditos, com histórico dos pagamentos disponível. O carnê não pode ser baixado com essa parcela; cobranças bancárias encerradas não podem ser reutilizadas.</p> : null}
      {model.needsReview ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-900">Há uma cobrança aguardando conferência. Atualize o carnê para verificar o retorno bancário.</p> : null}
    </> : <OtherCreditPlanWizard model={model} resources={resources} />}
    {model.planId && shownPreview ? <OtherCreditPlanPreview preview={shownPreview} plan={model.plan} /> : null}
    {model.progress ? <p role="status" aria-live="polite" className="text-sm font-bold text-emerald-800">Emissão bancária: {model.progress.done} de {model.progress.total} cobrança(s) confirmada(s).</p> : null}
    {model.refreshProgress ? <p role="status" aria-live="polite" className="text-sm font-bold text-emerald-800">Consulta bancária: {model.refreshProgress.done} de {model.refreshProgress.total} cobrança(s) conferida(s).</p> : null}
    {model.planId && model.plan ? <p className="text-xs leading-5 text-slate-500">As parcelas já estão salvas em Outros Créditos. Emita os boletos para baixar o carnê. Se uma emissão parar, os boletos confirmados são preservados.</p> : null}

    {model.planId ? <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
      {model.planId ? <>
        <button type="button" onClick={model.refresh} disabled={model.busy || model.planRefreshing} className={buttonClass}>
          <RefreshCw size={16} className={model.planRefreshing ? 'animate-spin' : ''} /> Atualizar carnê
        </button>
        {model.plan ? <>
          <button type="button" onClick={model.issuePlan} disabled={model.busy || model.needsReview || !model.pendingCount}
            className={`${buttonClass} border-emerald-200 bg-emerald-50 text-emerald-800`}>
            {model.issuePending ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} />}
            {model.issuePending ? 'Emitindo boletos' : model.issuedCount ? 'Continuar emissão' : 'Emitir boletos Banese'}
          </button>
          <button type="button" onClick={model.download} disabled={model.busy || !canDownload}
            className={`${buttonClass} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}>
            {model.documentPending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Baixar carnê
          </button>
        </> : null}
      </> : null}
    </div> : null}
  </div>;
}

export function OtherCreditPlanModal({ model, resources }: { model: OtherCreditPlanModel; resources: Resources }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [model.step, model.isOpen, model.planId]);
  useEffect(() => {
    if (!model.isOpen) return undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [model.isOpen]);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !model.busy) { event.preventDefault(); model.close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = (Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]',
    ) || []) as HTMLElement[]).filter(element => element.offsetParent !== null && !element.closest('fieldset[disabled]'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  if (!model.isOpen || typeof document === 'undefined') return null;
  return createPortal(<div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="other-credit-plan-title" aria-busy={model.busy}
    tabIndex={-1} onKeyDown={handleKeyDown} className="fixed inset-0 z-[150] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#eef2f7] text-[#071b3f]">
    <header className="shrink-0 border-t-[3px] border-emerald-500 bg-[#001a33] text-white">
      <div className="mx-auto flex min-h-[82px] max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3"><BookOpen size={24} className="text-emerald-300" />
          <div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Outros Créditos</p>
            <h2 id="other-credit-plan-title" className="mt-1 text-lg font-black">{model.planId ? 'Carnê avulso' : 'Gerar carnê avulso'}</h2>
          </div>
        </div>
        <button type="button" onClick={model.close} disabled={model.busy} aria-label="Fechar carnê"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-bold disabled:opacity-40"><span className="hidden sm:inline">Fechar</span><X size={18} /></button>
      </div>
    </header>
    <main ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8">
        <div className="rounded-[2rem] border border-white bg-white p-4 shadow-lg sm:p-6 lg:p-8"><OtherCreditPlanContent model={model} resources={resources} /></div>
      </div>
    </main>
  </div>, document.body);
}
