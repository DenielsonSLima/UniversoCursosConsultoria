import React, { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Loader2 } from 'lucide-react';
import { OtherCreditPlanForm } from './OtherCreditPlanForm';
import { OtherCreditPlanFinancialForm } from './OtherCreditPlanFinancialForm';
import { OtherCreditPlanSchedule } from './OtherCreditPlanSchedule';
import { OtherCreditPlanPreview } from './OtherCreditPlanPreview';
import type { OutrosCreditosModel } from './useOutrosCreditos';
import type { OtherCreditPlanModel } from './useOtherCreditPlan';

type Resources = Pick<OutrosCreditosModel, 'partners' | 'categories' | 'activePolo' | 'partnersLoading' | 'partnersError' | 'retryPartners'>;
const steps = ['Dados do carnê', 'Financeiro', 'Revisão'];
const buttonClass = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black uppercase tracking-wider transition disabled:opacity-50 sm:px-5';

export function OtherCreditPlanWizard({ model, resources }: { model: OtherCreditPlanModel; resources: Resources }) {
  const headingRef = useRef<React.ComponentRef<'h3'>>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [model.step]);
  const disabled = model.busy || Boolean(model.attempt);
  const form = model.attempt?.form || model.form;
  const input = model.preview?.input || model.attempt?.input;
  const customerName = resources.partners.find(partner => partner.id === form.partnerId)?.nome || 'Pagador cadastrado';
  const categoryName = resources.categories.find(category => category.id === form.categoryId)?.nome || 'Sem categoria específica';
  return <div className="space-y-6">
    <ol aria-label="Etapas do carnê" className="grid grid-cols-3 gap-2 sm:gap-4">
      {steps.map((label, index) => <li key={label} aria-current={model.step === index + 1 ? 'step' : undefined}
        className={`flex min-w-0 flex-col items-center gap-2 rounded-2xl border p-3 sm:flex-row sm:gap-3 sm:p-4 ${model.step === index + 1 ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-500'}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${model.step >= index + 1 ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>
          {model.step > index + 1 ? <Check size={15} /> : index + 1}
        </span>
        <span className="min-w-0 text-center text-[11px] font-bold sm:text-left sm:text-sm">
          <span className="sm:hidden">{index === 0 ? 'Dados' : label}</span><span className="hidden sm:inline">{label}</span>
        </span>
      </li>)}
    </ol>
    <div>
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-black text-[#001a33] outline-none">{steps[model.step - 1]}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{model.step === 1 ? 'Escolha o pagador e identifique a cobrança.' : model.step === 2
        ? 'Configure as condições e ajuste cada parcela antes de revisar.' : 'Confira os dados e todas as cobranças antes de criar o carnê.'}</p>
    </div>
    {model.step === 1 ? <OtherCreditPlanForm form={form} onChange={model.changeForm} disabled={disabled}
      partners={resources.partners} categories={resources.categories} partnersLoading={resources.partnersLoading}
      partnersError={resources.partnersError} retryPartners={() => { void resources.retryPartners(); }} /> : null}
    {model.step === 2 ? <OtherCreditPlanFinancialForm form={form} onChange={model.changeForm} disabled={disabled}>
      <OtherCreditPlanSchedule form={form} schedule={model.schedule} current={Boolean(model.preview)} pending={model.previewPending}
        disabled={disabled} onChange={model.changeForm} onRefresh={() => model.previewPlan()} />
    </OtherCreditPlanFinancialForm> : null}
    {model.step === 3 ? <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        {[
          ['Pagador', customerName], ['Categoria', categoryName], ['Descrição', form.description],
          ['Periodicidade', input?.periodicidade === 'DIAS_CORRIDOS_30' ? 'A cada 30 dias' : 'Mensal · mesmo dia'],
        ].map(([label, value]) => <div key={label}><dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</dt>
          <dd className="mt-1 text-sm font-bold text-[#001a33]">{value}</dd></div>)}
      </dl>
      {model.preview ? <OtherCreditPlanPreview preview={model.preview} /> : <p className="text-sm leading-6 text-slate-500">
        {model.attempt ? 'A configuração deste pedido está preservada. Confirme novamente para recuperar o mesmo carnê.' : 'Volte ao financeiro para recalcular as parcelas antes de criar.'}
      </p>}
    </fieldset> : null}
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white py-4">
      <p className="text-xs font-bold text-slate-500">Etapa {model.step} de 3</p>
      <div className={`grid w-full gap-2 sm:flex sm:w-auto sm:gap-3 ${model.step > 1 && !model.attempt ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {model.step > 1 && !model.attempt ? <button type="button" onClick={model.previousStep} disabled={model.busy || model.previewPending}
          className={`${buttonClass} border-slate-200 text-slate-600 hover:bg-slate-50`}><ArrowLeft size={16} /> Voltar</button> : null}
        {model.step < 3 ? <button type="button" onClick={model.nextStep} disabled={model.busy || model.previewPending}
          className={`${buttonClass} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}>
          {model.previewPending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          {model.step === 1 ? 'Ir para financeiro' : model.previewPending ? 'Calculando parcelas' : 'Revisar carnê'}
        </button> : <button type="button" onClick={model.createPlan} disabled={model.busy || (!model.preview && !model.attempt)}
          className={`${buttonClass} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}>
          {model.createPending ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}
          {model.createPending ? 'Salvando carnê' : model.attempt ? 'Confirmar criação novamente' : 'Criar carnê'}
        </button>}
      </div>
    </div>
  </div>;
}
