import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react';
import type { ExternalTransferScheduleItem } from './external-transfer.contract';
import ExternalTransferDecimalInput from './ExternalTransferDecimalInput';
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
const ExternalTransferScheduleRow: React.FC<Props> = ({ item, index, maxCiclos, disabled, canMoveUp, canMoveDown, onPatch, onMove, onRemove, onCycle }) => {
  const [expanded, setExpanded] = useState(false);
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const charges: Array<{ key: 'descontoPontualidade' | 'multaAtrasoPercentual' | 'jurosAtrasoPercentual'; label: string; percentage: boolean }> = [
    { key: 'descontoPontualidade', label: 'Desconto por pontualidade', percentage: false },
    { key: 'multaAtrasoPercentual', label: 'Multa por atraso', percentage: true },
    { key: 'jurosAtrasoPercentual', label: 'Juros ao mês', percentage: true },
  ];
  return <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-black text-[#001a33]"><span className="mr-2 rounded-md bg-blue-50 px-2 py-1 text-blue-800">C{item.cicloNumero}</span>{index + 1}. {labels[item.tipo]}</p>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Mover cobrança ${index + 1} para cima`} disabled={disabled || !canMoveUp} onClick={() => onMove(-1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-25"><ArrowUp size={15} /></button>
        <button type="button" aria-label={`Mover cobrança ${index + 1} para baixo`} disabled={disabled || !canMoveDown} onClick={() => onMove(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-25"><ArrowDown size={15} /></button>
        <button type="button" aria-label={`Remover cobrança ${index + 1}`} disabled={disabled} onClick={onRemove} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={15} /></button>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ExternalTransferDecimalInput label={`Valor da cobrança ${index + 1}`} value={item.valor} disabled={disabled} onChange={(valor) => onPatch({ valor })} />
      <label className="space-y-1 text-xs text-slate-600">Vencimento
        <input aria-label={`Vencimento da cobrança ${index + 1}`} type="date" min={getMaceioIsoDate()} disabled={disabled} value={item.vencimento}
          onChange={(event) => onPatch({ vencimento: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm disabled:opacity-60" />
      </label>
    </div>
    {item.tipo === 'PARCELA' && maxCiclos === 2 && <div role="group" aria-label={`Ciclo da cobrança ${index + 1}`} className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold text-slate-500">Mover para o ciclo:</span>
      {([1, 2] as const).map((cycle) => <button key={cycle} type="button" aria-pressed={item.cicloNumero === cycle} disabled={disabled} onClick={() => onCycle(cycle)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${item.cicloNumero === cycle ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>C{cycle}</button>)}
    </div>}
    <button type="button" aria-expanded={expanded} disabled={disabled} onClick={() => setExpanded((current) => !current)} className="flex items-center gap-1.5 text-[10px] font-bold text-blue-800"><ChevronDown size={13} />Desconto, multa e juros desta cobrança</button>
    {expanded && <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
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
    </div>}
  </article>;
};
export default ExternalTransferScheduleRow;
