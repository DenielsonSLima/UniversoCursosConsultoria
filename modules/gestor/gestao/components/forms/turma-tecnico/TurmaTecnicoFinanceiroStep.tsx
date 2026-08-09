import React from 'react';
import { BadgeDollarSign, CalendarDays, FileText, History, Info, ReceiptText, Repeat2, WalletCards } from 'lucide-react';
import { FINANCIAL_POLICY_OPTIONS } from './turma-tecnico-form.constants';
import type { TurmaTecnicoFormData } from './turma-tecnico-form.types';

interface TurmaTecnicoFinanceiroStepProps {
  formData: TurmaTecnicoFormData;
  onChange: (patch: Partial<TurmaTecnicoFormData>) => void;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

const TurmaTecnicoFinanceiroStep: React.FC<TurmaTecnicoFinanceiroStepProps> = ({ formData, onChange }) => {
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
        <p className="mt-1 text-xs font-medium text-slate-500">Defina a intenção completa. O servidor valida os valores e monta o cronograma canônico ao criar a turma.</p>
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
              <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">Inclui o título inicial quando o aluno for vinculado. A turma nasce sem aluno e sem cobrança emitida.</span>
            </span>
          </label>
          <label className="mt-4 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Valor da matrícula</span>
            <input type="number" min={0} step="0.01" disabled={!formData.cobrarMatricula} value={formData.valorMatricula} onChange={(event) => changeNumber('valorMatricula', event.target.value)} className={inputClass} />
          </label>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-start gap-3">
            <WalletCards size={17} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <p className="text-xs font-black uppercase text-[#001a33]">Mensalidades</p>
              <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">Quantidade do ciclo após a matrícula, ou desde o início quando não houver matrícula.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-500">Parcelas</span>
              <input type="number" min={1} max={60} value={formData.qtdParcelas} onChange={(event) => changeNumber('qtdParcelas', event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-500">Valor</span>
              <input type="number" min={0.01} step="0.01" value={formData.valorParcela} onChange={(event) => changeNumber('valorParcela', event.target.value)} className={inputClass} />
            </label>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${formData.cobrarRematricula ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50'}`}>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={formData.cobrarRematricula} onChange={(event) => toggleRematricula(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600" />
            <span>
              <span className="flex items-center gap-2 text-xs font-black uppercase text-[#001a33]"><Repeat2 size={15} className="text-amber-600" /> Cobrar rematrícula</span>
              <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">Quando ativa, abre o próximo ciclo somente após a baixa das mensalidades.</span>
            </span>
          </label>
          <label className="mt-4 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Valor da rematrícula</span>
            <input type="number" min={0} step="0.01" disabled={!formData.cobrarRematricula} value={formData.valorRematricula} onChange={(event) => changeNumber('valorRematricula', event.target.value)} className={inputClass} />
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-600" />
            <p className="text-xs font-black uppercase text-[#001a33]">Vencimento padrão</p>
          </div>
          <label className="mt-4 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Dia do mês</span>
            <select value={formData.diaVencimentoPadrao} onChange={(event) => changeNumber('diaVencimentoPadrao', event.target.value)} className={inputClass}>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>Todo dia {String(day).padStart(2, '0')}</option>
              ))}
            </select>
          </label>
          <p className="mt-3 flex items-start gap-2 text-[10px] font-semibold leading-relaxed text-slate-500"><Info size={13} className="mt-0.5 shrink-0" /> Em meses curtos, o servidor ajusta para o último dia válido.</p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-center gap-2">
            <BadgeDollarSign size={17} className="text-blue-600" />
            <p className="text-xs font-black uppercase text-[#001a33]">Desconto, juros e multa</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase text-blue-700">Desconto pontualidade (R$)</span>
              <input type="number" min={0} step="0.01" value={formData.descontoPontualidade} onChange={(event) => changeNumber('descontoPontualidade', event.target.value)} className={inputClass} />
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
          <p className="mt-3 text-[10px] font-semibold leading-relaxed text-blue-700/75">O juros mensal é proporcional aos dias de atraso; a multa percentual é aplicada uma única vez. Os valores finais são calculados pelo servidor.</p>
        </div>
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
            <p className="text-xs font-black uppercase text-[#001a33]">Origem e continuidade</p>
            <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">Use “histórico anterior” somente para uma turma trazida de outro controle financeiro.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
          <label className={`flex items-start gap-3 rounded-xl border p-3 ${formData.gerarCobrancasFuturas ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
            <input type="checkbox" disabled={formData.origemFinanceira === 'LEGADO'} checked={formData.gerarCobrancasFuturas} onChange={(event) => onChange({ gerarCobrancasFuturas: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 disabled:opacity-50" />
            <span><span className="block text-[10px] font-black uppercase text-[#001a33]">Liberar próximas cobranças após cada baixa</span><span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">A sequência financeira continua sendo gerada pelo backend, sem envio para gateways legados.</span></span>
          </label>
        </div>
      </div>
    </section>
  );
};

export default TurmaTecnicoFinanceiroStep;
