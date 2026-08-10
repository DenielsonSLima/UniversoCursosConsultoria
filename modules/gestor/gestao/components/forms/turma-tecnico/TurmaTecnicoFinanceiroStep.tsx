import React, { useEffect, useState } from 'react';
import { BadgeDollarSign, Calculator, CalendarDays, FileText, History, Info, Loader2, ReceiptText, Repeat2, WalletCards } from 'lucide-react';
import { FINANCIAL_POLICY_OPTIONS } from './turma-tecnico-form.constants';
import {
  getTurmaTecnicoFinanceiroPreview,
  type TurmaTecnicoFinanceiroPreview,
} from './turma-tecnico-financeiro-preview.service';
import type { TurmaTecnicoFormData } from './turma-tecnico-form.types';
import { formatCurrencyBRL, parseCurrencyBRLInput } from './turma-tecnico-form.utils';

interface TurmaTecnicoFinanceiroStepProps {
  formData: TurmaTecnicoFormData;
  onChange: (patch: Partial<TurmaTecnicoFormData>) => void;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

const formatPercent = (value: number, maximumFractionDigits = 4) => value.toLocaleString('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits,
});

interface CurrencyInputProps {
  disabled?: boolean;
  value: number;
  onValueChange: (value: number) => void;
}

const CurrencyInput: React.FC<CurrencyInputProps> = ({ disabled = false, value, onValueChange }) => (
  <input
    type="text"
    inputMode="numeric"
    disabled={disabled}
    value={formatCurrencyBRL(value)}
    onFocus={(event) => event.currentTarget.select()}
    onChange={(event) => onValueChange(parseCurrencyBRLInput(event.target.value))}
    className={inputClass}
  />
);

const TurmaTecnicoFinanceiroStep: React.FC<TurmaTecnicoFinanceiroStepProps> = ({ formData, onChange }) => {
  const [preview, setPreview] = useState<TurmaTecnicoFinanceiroPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const ciclosDoCurso = formData.cobrarRematricula ? 2 : 1;
  const totalMensalidadesCurso = formData.qtdParcelas * ciclosDoCurso;

  useEffect(() => {
    const previewInputIsValid = Boolean(formData.primeiroVencimentoPadrao)
      && Number.isInteger(formData.qtdParcelas)
      && formData.qtdParcelas >= 1
      && formData.qtdParcelas <= 60
      && Number.isFinite(formData.valorParcela)
      && formData.valorParcela > 0
      && Number.isInteger(formData.diaVencimentoPadrao)
      && formData.diaVencimentoPadrao >= 1
      && formData.diaVencimentoPadrao <= 31;

    if (!previewInputIsValid) {
      setPreview(null);
      setPreviewError('');
      setIsPreviewLoading(false);
      return undefined;
    }

    let active = true;
    setIsPreviewLoading(true);
    setPreviewError('');
    const timeoutId = window.setTimeout(() => {
      getTurmaTecnicoFinanceiroPreview({
        dataInicio: formData.primeiroVencimentoPadrao,
        cobrarMatricula: formData.cobrarMatricula,
        valorMatricula: formData.valorMatricula,
        cobrarRematricula: formData.cobrarRematricula,
        valorRematricula: formData.valorRematricula,
        qtdParcelas: formData.qtdParcelas,
        valorParcela: formData.valorParcela,
        descontoPontualidade: formData.descontoPontualidade,
        jurosAtraso: formData.jurosAtraso,
        multaAtrasoPercentual: formData.multaAtrasoPercentual,
        aplicarDescontoMensalidade: formData.aplicarDescontoMensalidade,
        aplicarMultaJurosMensalidade: formData.aplicarMultaJurosMensalidade,
        diaVencimentoPadrao: formData.diaVencimentoPadrao,
      }).then((result) => {
        if (!active) return;
        setPreview(result);
        setIsPreviewLoading(false);
      }).catch((error: unknown) => {
        if (!active) return;
        console.error('Erro ao calcular prévia financeira da nova turma:', error);
        setPreview(null);
        setPreviewError('Não foi possível calcular os exemplos agora. Confira os valores e tente novamente.');
        setIsPreviewLoading(false);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    formData.aplicarDescontoMensalidade,
    formData.aplicarMultaJurosMensalidade,
    formData.cobrarMatricula,
    formData.cobrarRematricula,
    formData.primeiroVencimentoPadrao,
    formData.descontoPontualidade,
    formData.diaVencimentoPadrao,
    formData.jurosAtraso,
    formData.multaAtrasoPercentual,
    formData.qtdParcelas,
    formData.valorMatricula,
    formData.valorParcela,
    formData.valorRematricula,
  ]);

  const changeNumber = (key: keyof TurmaTecnicoFormData, value: string) => {
    onChange({ [key]: Number(value) } as Partial<TurmaTecnicoFormData>);
  };

  const toggleMatricula = (enabled: boolean) => onChange({
    cobrarMatricula: enabled,
    exigeMatricula: enabled,
    ...(!enabled ? {
      aplicarDescontoMatricula: false,
      aplicarMultaJurosMatricula: false,
    } : {}),
  });

  const toggleRematricula = (enabled: boolean) => onChange({
    cobrarRematricula: enabled,
    ...(!enabled ? {
      aplicarDescontoRematricula: false,
      aplicarMultaJurosRematricula: false,
    } : {}),
  });

  return (
    <section aria-labelledby="financial-step-title" className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Etapa 3</p>
        <h4 id="financial-step-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Regra financeira da turma</h4>
        <p className="mt-1 text-xs font-medium text-slate-500">Defina matrícula, ciclos, rematrícula, vencimento e encargos da turma.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`rounded-2xl border p-4 ${formData.cobrarMatricula ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={formData.cobrarMatricula}
              onChange={(event) => toggleMatricula(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600"
            />
            <span>
              <span className="flex items-center gap-2 text-xs font-black uppercase text-[#001a33]"><ReceiptText size={15} className="text-emerald-600" /> Gerar cobrança de matrícula</span>
              <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">Quando o financeiro do aluno for ativado, a matrícula será a primeira cobrança.</span>
            </span>
          </label>
          <label className="mt-4 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Valor da matrícula</span>
            <CurrencyInput disabled={!formData.cobrarMatricula} value={formData.valorMatricula} onValueChange={(value) => onChange({ valorMatricula: value })} />
          </label>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-start gap-3">
            <WalletCards size={17} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <p className="text-xs font-black uppercase text-[#001a33]">Mensalidades por ciclo</p>
              <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">A mesma quantidade será usada no segundo e último ciclo, aberto após a rematrícula paga.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-500">Mens/Ciclo</span>
              <input type="number" min={1} max={60} value={formData.qtdParcelas} onChange={(event) => changeNumber('qtdParcelas', event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-500">Valor</span>
              <CurrencyInput value={formData.valorParcela} onValueChange={(value) => onChange({ valorParcela: value })} />
            </label>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${formData.cobrarRematricula ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50'}`}>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={formData.cobrarRematricula} onChange={(event) => toggleRematricula(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600" />
            <span>
              <span className="flex items-center gap-2 text-xs font-black uppercase text-[#001a33]"><Repeat2 size={15} className="text-amber-600" /> Cobrar rematrícula</span>
              <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">É gerada depois que as mensalidades do primeiro ciclo forem pagas. Após a baixa dela, começa o segundo e último ciclo.</span>
            </span>
          </label>
          <label className="mt-4 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Valor da rematrícula</span>
            <CurrencyInput disabled={!formData.cobrarRematricula} value={formData.valorRematricula} onValueChange={(value) => onChange({ valorRematricula: value })} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-[#001a33] p-5 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-100"><Calculator size={16} /> Composição financeira do curso</p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">
              {formData.cobrarMatricula ? `${formatCurrencyBRL(formData.valorMatricula)} de matrícula + ` : ''}
              {totalMensalidadesCurso} mensalidades de {formatCurrencyBRL(formData.valorParcela)}
              {formData.cobrarRematricula ? `, divididas em 2 ciclos de ${formData.qtdParcelas}` : ''}
              {formData.cobrarRematricula ? ` + ${formatCurrencyBRL(formData.valorRematricula)} de rematrícula` : ''}.
            </p>
            <p className="mt-2 text-[10px] font-semibold leading-relaxed text-blue-200">
              {formData.cobrarRematricula
                ? `A rematrícula separa os dois ciclos: ${formData.qtdParcelas} mensalidades antes e ${formData.qtdParcelas} depois do pagamento dela.`
                : `Sem rematrícula, o curso possui ${formData.qtdParcelas} mensalidades.`}
            </p>
          </div>
          <div className="min-w-[190px] rounded-xl border border-white/15 bg-white/10 px-4 py-3 sm:text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-blue-200">Total nominal do curso</p>
            <p className="mt-1 text-xl font-black">
              {isPreviewLoading ? <Loader2 size={20} className="inline animate-spin" /> : preview ? formatCurrencyBRL(preview.totalCurso) : '—'}
            </p>
            <p className="mt-1 text-[9px] font-semibold text-blue-200">Antes de desconto, multa ou juros.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-600" />
            <p className="text-xs font-black uppercase text-[#001a33]">Vencimento padrão</p>
          </div>
          <label className="mt-4 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Primeiro vencimento</span>
            <input
              type="date"
              value={formData.primeiroVencimentoPadrao}
              onChange={(event) => onChange({ primeiroVencimentoPadrao: event.target.value })}
              className={inputClass}
            />
            <span className="block text-[10px] font-semibold leading-relaxed text-slate-500">Será trazido automaticamente ao matricular o aluno, mas poderá ser alterado para aquela matrícula.</span>
          </label>
          <label className="mt-4 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Dia do mês</span>
            <select value={formData.diaVencimentoPadrao} onChange={(event) => changeNumber('diaVencimentoPadrao', event.target.value)} className={inputClass}>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>Todo dia {String(day).padStart(2, '0')}</option>
              ))}
            </select>
          </label>
          <p className="mt-3 flex items-start gap-2 text-[10px] font-semibold leading-relaxed text-slate-500"><Info size={13} className="mt-0.5 shrink-0" /> Em meses curtos, o vencimento vai para o último dia válido.</p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-center gap-2">
            <BadgeDollarSign size={17} className="text-blue-600" />
            <p className="text-xs font-black uppercase text-[#001a33]">Desconto, juros e multa</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-blue-700">Desconto pontualidade (R$)</span>
              <CurrencyInput value={formData.descontoPontualidade} onValueChange={(value) => onChange({ descontoPontualidade: value })} />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-blue-700">Juros ao mês (%)</span>
              <input type="number" min={0} max={100} step="0.01" value={formData.jurosAtraso} onChange={(event) => changeNumber('jurosAtraso', event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-blue-700">Multa única (%)</span>
              <input type="number" min={0} max={100} step="0.01" value={formData.multaAtrasoPercentual} onChange={(event) => changeNumber('multaAtrasoPercentual', event.target.value)} className={inputClass} />
            </label>
          </div>
          <p className="mt-3 text-[10px] font-semibold leading-relaxed text-blue-700/75">O juros mensal é proporcional aos dias de atraso; a multa percentual é aplicada uma única vez. Os valores finais são atualizados automaticamente.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600"><Calculator size={18} /></div>
          <div>
            <p className="text-xs font-black uppercase text-[#001a33]">Exemplos automáticos da mensalidade</p>
            <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">Os exemplos abaixo mudam conforme os valores informados e são calculados pela regra financeira oficial.</p>
          </div>
        </div>

        {previewError ? <p role="alert" className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">{previewError}</p> : null}
        {isPreviewLoading && !preview ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-500"><Loader2 size={16} className="animate-spin" /> Calculando exemplos...</div>
        ) : preview ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[10px] font-black uppercase text-emerald-700">Pagamento até o vencimento</p>
              <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-600">
                Mensalidade de {formatCurrencyBRL(formData.valorParcela)}
                {formData.aplicarDescontoMensalidade
                  ? ` − desconto de ${formatCurrencyBRL(preview.descontoAplicado)}.`
                  : ', sem desconto configurado.'}
              </p>
              <p className="mt-4 text-[9px] font-black uppercase text-emerald-600">Valor final</p>
              <p className="mt-1 text-xl font-black text-emerald-700">{formatCurrencyBRL(preview.valorComDesconto)}</p>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-[10px] font-black uppercase text-rose-600">Pagamento com 30 dias de atraso</p>
              <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-600">
                Juros: {formatPercent(formData.jurosAtraso, 2)}% ao mês = {formatPercent(preview.jurosPercentualDia)}% ao dia ≈ {formatCurrencyBRL(preview.jurosValorDia)}/dia; em 30 dias, {formatCurrencyBRL(preview.jurosMensal)}. Multa única: {formatPercent(formData.multaAtrasoPercentual, 2)}% = {formatCurrencyBRL(preview.multaAplicada)}.
              </p>
              <p className="mt-4 text-[9px] font-black uppercase text-rose-500">Valor final</p>
              <p className="mt-1 text-xl font-black text-rose-700">{formatCurrencyBRL(preview.valorComAtraso)}</p>
            </div>
          </div>
        ) : null}
      </div>

      <fieldset className="rounded-2xl border border-slate-200 p-4">
        <legend className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Onde aplicar desconto e encargos</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {FINANCIAL_POLICY_OPTIONS.map((option) => {
            const disabled = option.enabledKey !== null ? !formData[option.enabledKey] : false;
            return (
              <div key={option.label} className={`rounded-xl border p-3 ${disabled ? 'border-slate-100 bg-slate-50 opacity-55' : 'border-blue-100 bg-blue-50/40'}`}>
                <p className="text-[10px] font-black uppercase text-[#001a33]">{option.label}</p>
                <label className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-600">
                  <input type="checkbox" disabled={disabled} checked={formData[option.descontoKey]} onChange={(event) => onChange({ [option.descontoKey]: event.target.checked } as Partial<TurmaTecnicoFormData>)} className="h-4 w-4 rounded border-blue-300 text-blue-600" /> Aplicar desconto
                </label>
                <label className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-600">
                  <input type="checkbox" disabled={disabled} checked={formData[option.multaKey]} onChange={(event) => onChange({ [option.multaKey]: event.target.checked } as Partial<TurmaTecnicoFormData>)} className="h-4 w-4 rounded border-blue-300 text-blue-600" /> Aplicar multa/juros
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700"><FileText size={18} /></div>
          <div>
            <p className="text-xs font-black uppercase text-[#001a33]">Frase impressa no boleto e no carnê</p>
            <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">A identificação da turma será acrescentada automaticamente pelo documento.</p>
          </div>
        </div>
        <textarea
          rows={3}
          maxLength={180}
          value={formData.instrucaoBoletoCarne}
          onChange={(event) => onChange({ instrucaoBoletoCarne: event.target.value })}
          className="mt-3 w-full resize-none rounded-xl border border-amber-200 bg-white p-3 text-sm font-bold leading-relaxed text-slate-700 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          placeholder="Ex.: SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 DIAS..."
        />
        <div className="mt-2 flex justify-between gap-4 text-[10px] font-semibold text-slate-500"><span>Esta orientação fica destacada nos documentos.</span><span>{formData.instrucaoBoletoCarne.length}/180</span></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <History size={17} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            <p className="text-xs font-black uppercase text-[#001a33]">Histórico anterior</p>
            <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">Use “histórico anterior” somente para uma turma trazida de outro controle financeiro.</p>
          </div>
        </div>
        <div className="mt-4 max-w-xl">
          <label className={`flex items-start gap-3 rounded-xl border p-3 ${formData.origemFinanceira === 'LEGADO' ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
            <input
              type="checkbox"
              checked={formData.origemFinanceira === 'LEGADO'}
              onChange={(event) => onChange({
                origemFinanceira: event.target.checked ? 'LEGADO' : 'NORMAL',
                financeiroHerdado: event.target.checked,
                gerarCobrancasFuturas: !event.target.checked,
              })}
              className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600"
            />
            <span><span className="block text-[10px] font-black uppercase text-[#001a33]">Turma com histórico financeiro anterior</span><span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">Preserva a origem legada e bloqueia novas cobranças automáticas.</span></span>
          </label>
        </div>
      </div>
    </section>
  );
};

export default TurmaTecnicoFinanceiroStep;
