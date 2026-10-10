import React, { useState } from 'react';
import type { ExternalTransferPreview, ExternalTransferScheduleAdjustment, ExternalTransferScheduleItem } from './external-transfer.contract';
import ExternalTransferDecimalInput from './ExternalTransferDecimalInput';
import { getMaceioIsoDate } from '../../../technicalClassDates';

interface Props {
  cycle: 1 | 2;
  context: ExternalTransferPreview;
  items: ExternalTransferScheduleItem[];
  disabled: boolean;
  onApply: (value: ExternalTransferScheduleAdjustment) => void;
}
type Configuration = Extract<ExternalTransferScheduleAdjustment, { acao: 'CONFIGURAR_CICLO' }>;
const ExternalTransferCycleConfigurator: React.FC<Props> = ({ cycle, context, items, disabled, onApply }) => {
  const [expanded, setExpanded] = useState(false);
  const [patch, setPatch] = useState<Partial<Configuration>>({});
  const selected = items.filter((item) => item.cicloNumero === cycle);
  const monthly = selected.filter((item) => item.tipo === 'PARCELA');
  const fee = selected.find((item) => item.tipo !== 'PARCELA');
  const quantity = patch.quantidadeParcelas ?? monthly.length;
  const feeEnabled = patch.cobrarTaxa ?? Boolean(fee);
  const valid = Number.isInteger(quantity) && quantity >= 0 && quantity <= context.quantidadeMaxima
    && !Object.values(patch).some((value) => value === '');
  return <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
    <button type="button" disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} className="text-xs font-black text-blue-900">Configurar C{cycle} · somente este ciclo</button>
    {expanded && <div className="mt-3 space-y-3">
      <p className="text-[10px] text-slate-500">Altere os campos desejados. Os demais valores e o outro ciclo serão preservados.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-600">Quantidade de mensalidades
          <input type="number" min={0} max={context.quantidadeMaxima} step={1} value={Number.isNaN(quantity) ? '' : quantity} disabled={disabled}
            onChange={(event) => setPatch((current) => ({ ...current, quantidadeParcelas: event.target.value === '' ? NaN : Number(event.target.value) }))}
            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" />
        </label>
        <label className="space-y-1 text-xs text-slate-600">Primeiro vencimento das mensalidades
          <input type="date" min={getMaceioIsoDate()} value={patch.primeiroVencimento ?? monthly[0]?.vencimento ?? ''} disabled={disabled}
            onChange={(event) => setPatch((current) => ({ ...current, primeiroVencimento: event.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" />
        </label>
        <ExternalTransferDecimalInput label="Valor das mensalidades" value={patch.valorMensalidade ?? monthly[0]?.valor ?? context.regra.valorMensalidade} disabled={disabled}
          onChange={(value) => setPatch((current) => ({ ...current, valorMensalidade: value }))} />
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={feeEnabled} disabled={disabled}
            onChange={(event) => setPatch((current) => ({ ...current, cobrarTaxa: event.target.checked }))} />{cycle === 1 ? 'Incluir matrícula' : 'Incluir rematrícula'}</label>
          <ExternalTransferDecimalInput label={cycle === 1 ? 'Valor da matrícula' : 'Valor da rematrícula'} value={patch.valorTaxa ?? fee?.valor ?? (cycle === 1 ? context.regra.valorMatricula : context.regra.valorRematricula)} disabled={disabled || !feeEnabled}
            onChange={(value) => setPatch((current) => ({ ...current, valorTaxa: value }))} />
        </div>
      </div>
      <button type="button" disabled={disabled || !valid || Object.keys(patch).length === 0} onClick={() => { onApply({ acao: 'CONFIGURAR_CICLO', cicloNumero: cycle, ...patch }); setPatch({}); }}
        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-40">Aplicar ao C{cycle}</button>
    </div>}
  </section>;
};
export default ExternalTransferCycleConfigurator;
