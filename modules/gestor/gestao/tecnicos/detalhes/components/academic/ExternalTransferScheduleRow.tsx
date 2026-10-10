import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react';
import type { ExternalTransferScheduleItem } from './external-transfer.contract';
import ExternalTransferDecimalInput from './ExternalTransferDecimalInput';
import { externalTransferScheduleItemError } from './external-transfer-presentation';
import { getMaceioIsoDate } from '../../../technicalClassDates';

interface Props {
  item: ExternalTransferScheduleItem;
  index: number;
  maxCiclos: 1 | 2;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: Partial<ExternalTransferScheduleItem>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onCycle: (cycle: 1 | 2) => void;
}
const labels = { MATRICULA: 'Matrícula', PARCELA: 'Mensalidade', REMATRICULA: 'Rematrícula' };
const charges = [
  { key: 'descontoPontualidade', label: 'Desconto por pontualidade', percentage: false },
  { key: 'multaAtrasoPercentual', label: 'Multa por atraso', percentage: true },
  { key: 'jurosAtrasoPercentual', label: 'Juros ao mês', percentage: true },
] as const;
const actionClass = 'flex min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-25';

const ExternalTransferScheduleRow: React.FC<Props> = ({ item, index, maxCiclos, disabled, canMoveUp, canMoveDown, onPatch, onMove, onRemove, onCycle }) => {
  const [expanded, setExpanded] = useState(false);
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const error = externalTransferScheduleItemError(item);
  return <article className={`space-y-3 rounded-xl border bg-white p-3 ${error ? 'border-red-200' : 'border-slate-200'}`}>
    <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(7.5rem,9rem)_minmax(8.5rem,10rem)_auto]">
      <p className="col-span-2 self-center text-xs font-black text-[#001a33] md:col-span-1">
        <span className="mr-2 rounded-md bg-blue-50 px-2 py-1 text-blue-800">C{item.cicloNumero}</span>{index + 1}. {labels[item.tipo]}
      </p>
      <ExternalTransferDecimalInput label={`Valor da cobrança ${index + 1}`} value={item.valor} disabled={disabled} onChange={(valor) => onPatch({ valor })} />
      <label className="space-y-1 text-xs text-slate-600">Vencimento
        <input aria-label={`Vencimento da cobrança ${index + 1}`} type="date" min={getMaceioIsoDate()} disabled={disabled} value={item.vencimento}
          onChange={(event) => onPatch({ vencimento: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm disabled:opacity-60" />
      </label>
      <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
        <button type="button" aria-label={`Mover cobrança ${index + 1} para cima`} disabled={disabled || !canMoveUp} onClick={() => onMove(-1)} className={actionClass}><ArrowUp size={15} /></button>
        <button type="button" aria-label={`Mover cobrança ${index + 1} para baixo`} disabled={disabled || !canMoveDown} onClick={() => onMove(1)} className={actionClass}><ArrowDown size={15} /></button>
        <button type="button" aria-label={`Remover cobrança ${index + 1}`} disabled={disabled} onClick={onRemove} className={`${actionClass} text-red-600 hover:bg-red-50`}><Trash2 size={15} /></button>
        <button type="button" aria-expanded={expanded} aria-label={`Editar condições da cobrança ${index + 1}`} disabled={disabled} onClick={() => setExpanded((current) => !current)}
          className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-bold text-blue-800 hover:bg-blue-50"><ChevronDown size={13} />Condições</button>
      </div>
    </div>
    {error && <p role="alert" className="text-xs font-semibold text-red-700">Cobrança {index + 1}: {error}</p>}
    {expanded && <div className="space-y-3 border-t border-slate-100 pt-3">
      {item.tipo === 'PARCELA' && maxCiclos === 2 && <div role="group" aria-label={`Ciclo da cobrança ${index + 1}`} className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500">Mover para o ciclo:</span>
        {([1, 2] as const).map((cycle) => <button key={cycle} type="button" aria-pressed={item.cicloNumero === cycle} disabled={disabled} onClick={() => onCycle(cycle)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${item.cicloNumero === cycle ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>C{cycle}</button>)}
      </div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {charges.map(({ key, label, percentage }) => {
          const enabled = Number(item[key]) > 0 || item[key] === '';
          return <div key={key} className="space-y-2">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
              <input type="checkbox" disabled={disabled} checked={enabled} onChange={(event) => {
                if (!event.target.checked) { setRemembered((current) => ({ ...current, [key]: item[key] })); onPatch({ [key]: percentage ? '0.000000' : '0.00' }); }
                else onPatch({ [key]: remembered[key] || '' });
              }} />{label}
            </label>
            <ExternalTransferDecimalInput label={percentage ? 'Percentual' : 'Valor do desconto'} percentage={percentage} value={item[key]} disabled={disabled || !enabled} onChange={(value) => onPatch({ [key]: value })} />
          </div>;
        })}
      </div>
    </div>}
  </article>;
};
export default ExternalTransferScheduleRow;
