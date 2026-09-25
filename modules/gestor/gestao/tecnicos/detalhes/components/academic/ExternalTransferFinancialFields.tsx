import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ExternalTransferPreview } from './external-transfer.contract';
import type { ExternalTransferDraft } from './external-transfer-draft';
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
}

const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm disabled:opacity-50';

const ExternalTransferFinancialFields: React.FC<Props> = ({
  draft, onChange, context, review, loading, error, disabled, reviewing, canReview, onReview, onRetry,
}) => {
  const rule = (review || context)?.regra;
  const fee = draft.cycle === 1 ? rule?.aplicacao.matricula : rule?.aplicacao.rematricula;
  return (
    <section className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
      <div>
        <h4 className="text-xs font-black uppercase text-blue-900">Plano financeiro de entrada</h4>
        <p className="mt-1 text-xs text-slate-600">O recebimento salva o plano. As cobranças serão revisadas e emitidas depois, no Financeiro da turma.</p>
      </div>
      {!draft.studentId ? <p className="text-xs text-slate-500">Selecione o aluno para consultar a regra da turma.</p> : error ? (
        <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
          <p>{error}</p>
          <button type="button" disabled={loading || disabled} onClick={onRetry} className="mt-2 font-bold underline">Consultar novamente</button>
        </div>
      ) : loading ? <p className="flex items-center gap-2 text-xs text-blue-700"><Loader2 size={14} className="animate-spin" />Consultando regra da turma...</p> : null}
      <fieldset disabled={disabled || !context || loading || Boolean(error)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-bold text-slate-600">
          <span>Ciclo inicial nesta instituição</span>
          <select className={inputClass} value={draft.cycle} onChange={(event) => onChange('cycle', Number(event.target.value) as 1 | 2)}>
            <option value={1}>1º ciclo</option><option value={2}>2º ciclo — continuidade externa</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          <span>Mensalidades no ciclo de entrada{context ? ` (até ${context.quantidadeMaxima})` : ''}</span>
          <input type="number" min={1} max={context?.quantidadeMaxima} step={1} className={inputClass}
            value={draft.installments} onChange={(event) => onChange('installments', event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          <span>Primeiro vencimento financeiro</span>
          <input type="date" min={getMaceioIsoDate()} className={inputClass} value={draft.firstDueDate} onChange={(event) => onChange('firstDueDate', event.target.value)} />
        </label>
        {draft.cycle === 2 && <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2">
          <span>Justificativa da continuidade no 2º ciclo</span>
          <textarea minLength={10} maxLength={1000} className={inputClass} value={draft.cycle2Reason} onChange={(event) => onChange('cycle2Reason', event.target.value)} />
          <span className="block font-normal">Informe ao menos 10 caracteres. A continuidade não registra pagamento ou quitação do 1º ciclo.</span>
        </label>}
      </fieldset>
      {rule && <div className="space-y-2 rounded-xl bg-white p-3 text-xs text-slate-600">
        <p className="font-bold text-slate-800">Valores padrão da turma</p>
        <dl className="grid grid-cols-2 gap-2">
          <div><dt>{draft.cycle === 1 ? 'Matrícula' : 'Rematrícula'}</dt><dd className="font-bold">{money(draft.cycle === 1 ? rule.valorMatricula : rule.valorRematricula)}</dd></div>
          <div><dt>Mensalidade</dt><dd className="font-bold">{money(rule.valorMensalidade)}</dd></div>
          <div><dt>Desconto de pontualidade</dt><dd>{money(rule.encargos.descontoPontualidade)}</dd></div>
          <div><dt>Multa / juros ao mês</dt><dd>{rule.encargos.multaAtrasoPercentual}% / {rule.encargos.jurosAtrasoPercentual}%</dd></div>
        </dl>
        <p>Mensalidades: desconto {rule.aplicacao.mensalidade.desconto ? 'aplicável' : 'não aplicável'}; multa/juros {rule.aplicacao.mensalidade.multaJuros ? 'aplicáveis' : 'não aplicáveis'}.</p>
        <p>{draft.cycle === 1 ? 'Matrícula' : 'Rematrícula'}: desconto {fee?.desconto ? 'aplicável' : 'não aplicável'}; multa/juros {fee?.multaJuros ? 'aplicáveis' : 'não aplicáveis'}.</p>
        <p>Na emissão, revise os valores por cobrança. No 1º ciclo, escolha matrícula com boleto, registro local sem boleto ou omissão.</p>
      </div>}
      {(review || context)?.avisos.map((warning, index) => <p key={index} className="text-xs text-amber-800">{warning}</p>)}
      <button type="button" onClick={onReview} disabled={disabled || reviewing || !canReview}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white p-2.5 text-xs font-bold text-blue-800 disabled:opacity-40">
        {reviewing && <Loader2 size={14} className="animate-spin" />}
        {reviewing ? 'Conferindo...' : review ? 'Plano conferido — consultar novamente' : 'Conferir plano financeiro'}
      </button>
      {review && <p className="text-xs font-bold text-emerald-700">Plano conferido: {review.financeiro.cicloNumero}º ciclo, {review.financeiro.quantidadeParcelas} mensalidades. Nenhuma cobrança será emitida ao receber.</p>}
    </section>
  );
};

export default ExternalTransferFinancialFields;
