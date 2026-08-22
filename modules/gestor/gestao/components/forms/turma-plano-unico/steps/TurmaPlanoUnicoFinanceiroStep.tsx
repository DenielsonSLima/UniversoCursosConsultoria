import React from 'react';
import { AlertCircle, CalendarDays, Loader2, Percent, ReceiptText, RefreshCw, WalletCards } from 'lucide-react';
import type { RegraPlanoFinanceiroUnico } from '../../../../presencial-financeiro-unico/types';
import type {
  TurmaPlanoUnicoFormConfig,
  TurmaPlanoUnicoFormData,
} from '../turma-plano-unico-form.types';
import { formatCivilDate, formatCurrencyBRL, formatPercentageBR, getPreviewInstallments } from '../turma-plano-unico-form.utils';
import CurrencyInput from '../CurrencyInput';

interface TurmaPlanoUnicoFinanceiroStepProps {
  config: TurmaPlanoUnicoFormConfig;
  formData: TurmaPlanoUnicoFormData;
  preview?: RegraPlanoFinanceiroUnico;
  previewError: Error | null;
  previewLoading: boolean;
  onChange: (patch: Partial<TurmaPlanoUnicoFormData>) => void;
  onRetryPreview: () => void;
}

const toNonNegativeNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const TurmaPlanoUnicoFinanceiroStep: React.FC<TurmaPlanoUnicoFinanceiroStepProps> = ({
  config,
  formData,
  preview,
  previewError,
  previewLoading,
  onChange,
  onRetryPreview,
}) => {
  const schedule = preview?.cronograma || [];
  const previewInstallments = getPreviewInstallments(schedule);
  const hasHiddenInstallments = schedule.length > previewInstallments.length;
  const inputClass = `w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-700 outline-none transition ${config.theme.accentFocus}`;
  const dueDay = preview?.diaVencimento || 0;

  return (
    <section aria-labelledby="turma-plano-unico-financeiro-title" className="space-y-6">
      <div>
        <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${config.theme.accentText}`}>Etapa 2</p>
        <h4 id="turma-plano-unico-financeiro-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Plano financeiro da turma</h4>
        <p className="mt-1 text-xs font-medium text-slate-500">Defina o valor integral e em quantas parcelas esta turma será paga. A quantidade é livre entre 1 e 60; quatro parcelas é apenas um exemplo.</p>
      </div>

      <div className={`rounded-2xl border ${config.theme.accentSoftBorder} ${config.theme.accentSoftBg} p-4`}>
        <div className="flex gap-3">
          <WalletCards size={18} className={`mt-0.5 shrink-0 ${config.theme.accentText}`} />
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Uma única regra para toda a turma</p>
            <p className={`mt-1 text-xs font-medium leading-relaxed ${config.theme.accentSoftText}`}>Quando um aluno for incluído, este plano aparecerá para conferência e as parcelas serão geradas a partir dele.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]"><WalletCards size={15} className={config.theme.accentText} /> Valor total do curso (R$)</span>
          <CurrencyInput
            className={inputClass}
            value={formData.valorTotal}
            onValueChange={(valorTotal) => onChange({ valorTotal })}
            placeholder="Ex.: 500,00"
            aria-label="Valor total do curso"
          />
        </label>
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]"><ReceiptText size={15} className={config.theme.accentText} /> Número de parcelas</span>
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            inputMode="numeric"
            className={inputClass}
            value={formData.qtdParcelas}
            onChange={(event) => onChange({ qtdParcelas: Math.max(1, Math.min(60, Math.trunc(Number(event.target.value) || 1))) })}
          />
        </label>
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><CalendarDays size={14} /> Primeiro vencimento</span>
          <input type="date" className={inputClass} value={formData.primeiroVencimento} onChange={(event) => onChange({ primeiroVencimento: event.target.value })} />
          <span className="block text-[10px] font-medium leading-relaxed text-slate-400">O dia escolhido será repetido nas próximas parcelas, respeitando meses mais curtos.</span>
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Dia de vencimento</p>
          <p className="mt-1 text-lg font-black text-[#001a33]">{dueDay ? `Dia ${String(dueDay).padStart(2, '0')}` : 'Defina o primeiro vencimento'}</p>
          <p className="mt-1 text-[10px] font-medium text-slate-500">Configurado pela data do primeiro vencimento.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><Percent size={14} /> Desconto por pontualidade (R$ por parcela)</span>
          <CurrencyInput className={inputClass} value={formData.descontoPontualidade} onValueChange={(descontoPontualidade) => onChange({ descontoPontualidade })} aria-label="Desconto por pontualidade por parcela" />
        </label>
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><Percent size={14} /> Juros por atraso (% ao mês por parcela)</span>
          <input type="number" min="0" max="100" step="0.01" inputMode="decimal" className={inputClass} value={formData.jurosAtrasoPercentual || ''} onChange={(event) => onChange({ jurosAtrasoPercentual: toNonNegativeNumber(event.target.value) })} />
        </label>
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><WalletCards size={14} /> Multa por atraso (R$ por parcela)</span>
          <CurrencyInput className={inputClass} value={formData.multaAtraso} onValueChange={(multaAtraso) => onChange({ multaAtraso })} aria-label="Multa por atraso por parcela" />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Prévia das parcelas</p>
            <p className="mt-1 text-xs font-medium text-slate-500">Valores, datas e ajuste de centavos são calculados pelo servidor para fechar exatamente o total.</p>
          </div>
          <div className={`rounded-lg ${config.theme.accentSoftBg} px-3 py-2 text-right`}>
            <p className={`text-[9px] font-black uppercase tracking-wide ${config.theme.accentSoftText}`}>Total configurado</p>
            <p className="mt-0.5 text-sm font-black text-[#001a33]">{formatCurrencyBRL(preview?.valorTotal ?? formData.valorTotal)}</p>
          </div>
        </div>

        {previewLoading ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-5 text-xs font-bold text-blue-700"><Loader2 size={15} className="animate-spin" /> Calculando a condição no servidor...</div>
        ) : previewError ? (
          <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-xs font-semibold text-rose-700">
            <div className="flex items-start gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{previewError.message || 'O banco não confirmou esta condição financeira.'}</span></div>
            <button type="button" onClick={onRetryPreview} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide"><RefreshCw size={12} /> Tentar novamente</button>
          </div>
        ) : schedule.length ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-slate-100 px-4 py-2 text-[9px] font-black uppercase tracking-wide text-slate-400">
              <span>Parcela</span><span>Vencimento</span><span>Valor</span>
            </div>
            {previewInstallments.map((installment, index) => (
              <React.Fragment key={installment.numero}>
                {hasHiddenInstallments && index === 3 ? (
                  <div className="border-b border-slate-100 px-4 py-2 text-center text-[10px] font-bold text-slate-400">+ {schedule.length - previewInstallments.length} parcela(s) configurada(s)</div>
                ) : null}
                <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2.5 text-xs">
                  <span className="font-black text-[#001a33]">{installment.numero}ª</span>
                  <span className="font-semibold text-slate-500">{formatCivilDate(installment.dataVencimento, 'Defina a data')}</span>
                  <span className="font-black text-[#001a33]">{formatCurrencyBRL(installment.valor)}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-xs font-medium text-slate-500">Informe curso, polo, valor total, quantidade e primeiro vencimento para consultar a divisão oficial.</div>
        )}
        <p className="mt-3 text-[10px] font-medium leading-relaxed text-slate-500">Desconto, juros de {formatPercentageBR(formData.jurosAtrasoPercentual)}% ao mês e multa são regras aplicadas individualmente a cada parcela gerada.</p>
      </div>
    </section>
  );
};

export default TurmaPlanoUnicoFinanceiroStep;
