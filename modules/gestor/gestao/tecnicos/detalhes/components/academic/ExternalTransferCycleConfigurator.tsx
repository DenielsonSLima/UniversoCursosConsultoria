import React from 'react';
import type { ExternalTransferPreview } from './external-transfer.contract';
import type { ExternalTransferCycleConfiguration, ExternalTransferCycleValues } from './external-transfer-financial-configuration';
import ExternalTransferDecimalInput from './ExternalTransferDecimalInput';
import { getMaceioIsoDate } from '../../../technicalClassDates';

interface Props {
  cycle: 1 | 2;
  context: ExternalTransferPreview;
  configuration: ExternalTransferCycleConfiguration;
  disabled: boolean;
  onChange: <K extends keyof ExternalTransferCycleValues>(field: K, value: ExternalTransferCycleValues[K]) => void;
}
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm disabled:bg-slate-100 disabled:opacity-60';
const periods = [
  { value: 'MENSAL_CALENDARIO', label: 'Mensal — mesmo dia' },
  { value: 'DIAS_CORRIDOS_30', label: 'A cada 30 dias' },
] as const;
const charges = [
  { flag: 'aplicarDesconto', key: 'descontoPontualidade', label: 'Desconto por pontualidade', percentage: false },
  { flag: 'aplicarMulta', key: 'multaAtrasoPercentual', label: 'Multa por atraso', percentage: true },
  { flag: 'aplicarJuros', key: 'jurosAtrasoPercentual', label: 'Juros ao mês', percentage: true },
] as const;

const ExternalTransferCycleConfigurator: React.FC<Props> = ({ cycle, context, configuration: value, disabled, onChange }) => {
  const inactive = disabled || !value.enabled;
  const feeName = cycle === 1 ? 'matrícula' : 'rematrícula';
  return <section className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-black text-blue-900">Ciclo {cycle}</h4>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <input type="checkbox" checked={value.enabled} disabled={disabled} onChange={(event) => onChange('enabled', event.target.checked)} />
        Planejar cobranças neste ciclo
      </label>
    </div>
    {!value.enabled && <p className="text-xs text-slate-600">Ciclo sem cobranças. As opções ficam preservadas caso você volte a ativá-lo.</p>}
    {value.hasIndividualConditions && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Há valores ou condições diferentes por cobrança. Os campos mostram a primeira mensalidade; somente os parâmetros que você alterar serão aplicados ao ciclo.</p>}
    <fieldset disabled={inactive} className="space-y-4">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs font-black text-blue-900">
          <input type="checkbox" checked={value.cobrarMensalidades} onChange={(event) => onChange('cobrarMensalidades', event.target.checked)} />
          Cobrar mensalidades
        </label>
        <fieldset disabled={inactive || !value.cobrarMensalidades} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-600">Quantidade de mensalidades
              <input type="number" min={1} max={context.quantidadeMaxima} step={1} value={value.quantidadeParcelas}
                onChange={(event) => onChange('quantidadeParcelas', event.target.value)} className={inputClass} />
            </label>
            <ExternalTransferDecimalInput label="Valor de cada mensalidade" value={value.valorMensalidade}
              disabled={inactive || !value.cobrarMensalidades} onChange={(amount) => onChange('valorMensalidade', amount)} />
            <label className="space-y-1 text-xs text-slate-600">Vencimento da 1ª mensalidade
              <input type="date" min={getMaceioIsoDate()} value={value.primeiroVencimento}
                onChange={(event) => onChange('primeiroVencimento', event.target.value)} className={inputClass} />
            </label>
            <div className="space-y-1">
              <p className="text-xs text-slate-600">Vencimentos seguintes</p>
              <div role="group" aria-label={`Periodicidade do ciclo ${cycle}`} className="flex flex-wrap gap-2">
                {periods.map((period) => <button key={period.value} type="button" aria-pressed={value.periodicidade === period.value}
                  onClick={() => onChange('periodicidade', period.value)} className={`rounded-lg border px-3 py-2 text-[11px] font-bold ${value.periodicidade === period.value
                    ? 'border-blue-300 bg-blue-100 text-blue-900' : 'border-slate-200 bg-white text-slate-600'}`}>{period.label}</button>)}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-600">{value.periodicidade === 'DIAS_CORRIDOS_30'
            ? 'Cada mensalidade seguinte vence 30 dias após a anterior.'
            : 'Cada mensalidade seguinte vence no mesmo dia do mês; em meses mais curtos, usa o último dia.'}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {charges.map(({ flag, key, label, percentage }) => <div key={key} className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                <input type="checkbox" checked={value[flag]} onChange={(event) => onChange(flag, event.target.checked)} />{label}
              </label>
              <ExternalTransferDecimalInput label={percentage ? 'Percentual' : 'Valor do desconto'} percentage={percentage} value={value[key]}
                disabled={inactive || !value.cobrarMensalidades || !value[flag]} onChange={(amount) => onChange(key, amount)} />
            </div>)}
          </div>
        </fieldset>
      </div>
      <div className="space-y-3 border-t border-blue-100 pt-3">
        <label className="flex items-center gap-2 text-xs font-black text-blue-900">
          <input type="checkbox" checked={value.cobrarTaxa} onChange={(event) => onChange('cobrarTaxa', event.target.checked)} />
          Cobrar {feeName}
        </label>
        <fieldset disabled={inactive || !value.cobrarTaxa} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ExternalTransferDecimalInput label={`Valor da ${feeName}`} value={value.valorTaxa} disabled={inactive || !value.cobrarTaxa}
            onChange={(amount) => onChange('valorTaxa', amount)} />
          <label className="space-y-1 text-xs text-slate-600">Vencimento da {feeName}
            <input type="date" min={getMaceioIsoDate()} value={value.vencimentoTaxa}
              onChange={(event) => onChange('vencimentoTaxa', event.target.value)} className={inputClass} />
          </label>
        </fieldset>
        <p className="text-[11px] text-slate-600">A data e as condições da {feeName} são independentes das mensalidades. Ajuste desconto, multa e juros dessa cobrança na próxima etapa.</p>
      </div>
    </fieldset>
  </section>;
};
export default ExternalTransferCycleConfigurator;
