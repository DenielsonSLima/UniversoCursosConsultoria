import React from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import type { ExternalTransferConditions, ExternalTransferPreview } from './external-transfer.contract';
import { externalTransferFinancialError, type ExternalTransferDraft } from './external-transfer-draft';
import { getMaceioIsoDate } from '../../../technicalClassDates';

interface Props {
  draft: ExternalTransferDraft;
  onChange: <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => void;
  context?: ExternalTransferPreview;
  review: ExternalTransferPreview | null;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  reviewing: boolean;
  canReview: boolean;
  onReview: () => void;
  onRetry: () => void;
  onRestoreDefaults: () => void;
}
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm disabled:bg-slate-100 disabled:opacity-60';
interface AmountProps {
  label: string;
  enabled: boolean;
  value: string;
  onToggle: (value: boolean) => void;
  onValue: (value: string) => void;
  percentage?: boolean;
}
const AmountField: React.FC<AmountProps> = ({ label, enabled, value, onToggle, onValue, percentage }) => <div className="space-y-2 rounded-xl border border-blue-100 bg-white p-3">
  <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
    <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />{label}
  </label>
  <label className="block space-y-1 text-xs text-slate-500">
    {percentage ? 'Percentual (%)' : 'Valor (R$)'}
    <input aria-label={`${label} — ${percentage ? 'percentual' : 'valor'}`} type="number" min={0} max={percentage ? 99.999999 : 9999999.99} step={percentage ? 0.000001 : 0.01}
      disabled={!enabled} className={inputClass} value={value} onChange={(event) => onValue(event.target.value)} />
  </label>
  {!enabled && <p className="text-[10px] text-slate-500">Não aplicar ao plano deste aluno.</p>}
</div>;

const ExternalTransferFinancialFields: React.FC<Props> = ({
  draft, onChange, context, review, loading, error, disabled, reviewing, canReview, onReview, onRetry, onRestoreDefaults,
}) => {
  const terms = draft.conditions;
  const update = <K extends keyof ExternalTransferConditions>(field: K, value: ExternalTransferConditions[K]) => {
    if (terms) onChange('conditions', { ...terms, [field]: value });
  };
  const validation = context ? externalTransferFinancialError(draft, context.quantidadeMaxima, context.maxCiclos) : null;
  const obligations: Array<{ label: string; discount: keyof ExternalTransferConditions; late: keyof ExternalTransferConditions; active: boolean }> = [
    { label: 'Matrícula', discount: 'aplicarDescontoMatricula', late: 'aplicarMultaJurosMatricula', active: terms?.cobrarMatricula || false },
    { label: 'Mensalidades', discount: 'aplicarDescontoMensalidade', late: 'aplicarMultaJurosMensalidade', active: draft.chargeMonthly },
    { label: 'Rematrícula', discount: 'aplicarDescontoRematricula', late: 'aplicarMultaJurosRematricula', active: terms?.cobrarRematricula || false },
  ];
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-black text-blue-900">Plano financeiro individual</h4>
        <p className="mt-1 text-xs text-slate-600">Os campos começam com os padrões da turma. Ajuste as condições deste aluno antes de conferir.</p>
      </div>
      <button type="button" onClick={onRestoreDefaults} disabled={disabled || loading || !context || Boolean(error)}
        className="flex items-center gap-1.5 rounded-lg border border-blue-200 p-2 text-[10px] font-bold text-blue-800 disabled:opacity-40"><RotateCcw size={13} />Restaurar padrões da turma</button>
    </div>
    {!draft.studentId ? <p className="text-xs text-slate-500">Selecione o aluno para consultar a regra da turma.</p> : error ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
      <p>{error}</p><button type="button" disabled={loading || disabled} onClick={onRetry} className="mt-2 font-bold underline">Consultar novamente</button>
    </div> : loading ? <p role="status" className="flex items-center gap-2 text-xs text-blue-700"><Loader2 size={14} className="animate-spin" />Consultando padrões da turma...</p> : null}
    <fieldset disabled={disabled || !context || loading || Boolean(error)} className="space-y-4">
      <div role="group" aria-label="Ciclo inicial" className="space-y-2">
        <p className="text-xs font-bold text-slate-600">Ciclo inicial nesta instituição</p>
        <div className="flex flex-wrap gap-2">{([1, 2] as const).filter((cycle) => cycle <= (context?.maxCiclos || 1)).map((cycle) => <button key={cycle} type="button" aria-pressed={draft.cycle === cycle}
          onClick={() => onChange('cycle', cycle)} className={`rounded-xl border px-4 py-2.5 text-xs font-bold ${draft.cycle === cycle ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>
          {cycle === 1 ? '1º ciclo' : '2º ciclo — continuidade externa'}</button>)}</div>
        {context?.maxCiclos === 1 && <p className="text-xs text-slate-500">Esta turma possui um único ciclo financeiro.</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-bold text-slate-600">Quantidade de mensalidades{context ? ` (até ${context.quantidadeMaxima})` : ''}
          <input type="number" min={1} max={context?.quantidadeMaxima} step={1} disabled={!draft.chargeMonthly} className={inputClass}
            value={draft.installments} onChange={(event) => onChange('installments', event.target.value)} />
          {!draft.chargeMonthly && <span className="block font-normal">Sem mensalidades neste plano; quantidade preservada para eventual reativação.</span>}
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">Primeiro vencimento financeiro
          <input type="date" min={getMaceioIsoDate()} className={inputClass} value={draft.firstDueDate} onChange={(event) => onChange('firstDueDate', event.target.value)} />
        </label>
      </div>
      {draft.cycle === 2 && <label className="block space-y-1 text-xs font-bold text-slate-600">Justificativa da continuidade no 2º ciclo
        <textarea minLength={10} maxLength={1000} className={inputClass} value={draft.cycle2Reason} onChange={(event) => onChange('cycle2Reason', event.target.value)} />
        <span className="block font-normal">Informe ao menos 10 caracteres. Esta opção não registra quitação na escola de origem.</span>
      </label>}
      {terms && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AmountField label="Cobrar mensalidades" enabled={draft.chargeMonthly} value={terms.valorMensalidade} onToggle={(value) => onChange('chargeMonthly', value)} onValue={(value) => update('valorMensalidade', value)} />
          <AmountField label="Cobrar matrícula (1º ciclo)" enabled={terms.cobrarMatricula} value={terms.valorMatricula} onToggle={(value) => update('cobrarMatricula', value)} onValue={(value) => update('valorMatricula', value)} />
          {context?.maxCiclos === 2 && <AmountField label="Cobrar rematrícula (2º ciclo)" enabled={terms.cobrarRematricula} value={terms.valorRematricula} onToggle={(value) => update('cobrarRematricula', value)} onValue={(value) => update('valorRematricula', value)} />}
          <AmountField label="Desconto por pontualidade" enabled={draft.chargeDiscount} value={terms.descontoPontualidade} onToggle={(value) => onChange('chargeDiscount', value)} onValue={(value) => update('descontoPontualidade', value)} />
          <AmountField label="Multa por atraso" percentage enabled={draft.chargeFine} value={terms.multaAtrasoPercentual} onToggle={(value) => onChange('chargeFine', value)} onValue={(value) => update('multaAtrasoPercentual', value)} />
          <AmountField label="Juros ao mês" percentage enabled={draft.chargeInterest} value={terms.jurosAtrasoPercentual} onToggle={(value) => onChange('chargeInterest', value)} onValue={(value) => update('jurosAtrasoPercentual', value)} />
        </div>
        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-700">Aplicar desconto e encargos em quais cobranças?</p>
          {obligations.filter((obligation) => obligation.label !== 'Rematrícula' || context?.maxCiclos === 2).map((obligation) => <div key={obligation.label} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <span className="w-24 font-bold">{obligation.label}</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!obligation.active || !draft.chargeDiscount} checked={Boolean(terms[obligation.discount])}
              onChange={(event) => update(obligation.discount, event.target.checked)} />Desconto</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!obligation.active || (!draft.chargeFine && !draft.chargeInterest)} checked={Boolean(terms[obligation.late])}
              onChange={(event) => update(obligation.late, event.target.checked)} />Multa e juros</label>
          </div>)}
        </section>
      </>}
    </fieldset>
    {validation && !loading && !error && <p role="status" className="text-xs text-amber-800">{validation}</p>}
    {(review || context)?.avisos.map((warning, index) => <p key={index} className="text-xs text-amber-800">{warning}</p>)}
    <button type="button" onClick={onReview} disabled={disabled || reviewing || !canReview}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800 disabled:opacity-40">
      {reviewing && <Loader2 size={14} className="animate-spin" />}{reviewing ? 'Conferindo condições...' : review ? 'Plano conferido — consultar novamente' : 'Conferir plano financeiro'}
    </button>
    {review && <p role="status" className="text-xs font-bold text-emerald-700">Condições conferidas. Continue para revisar o recebimento.</p>}
  </section>;
};

export default ExternalTransferFinancialFields;
