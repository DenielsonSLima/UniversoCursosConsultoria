import React, { useState } from 'react';
import { Loader2, Plus, RotateCcw } from 'lucide-react';
import type { ExternalTransferPreview, ExternalTransferScheduleAdjustment } from './external-transfer.contract';
import {
  changeExternalTransferItemCycle, externalTransferFinancialError, moveExternalTransferItem, removeExternalTransferItem,
  updateExternalTransferItem, type ExternalTransferDraft,
} from './external-transfer-draft';
import ExternalTransferCycleConfigurator from './ExternalTransferCycleConfigurator';
import ExternalTransferScheduleRow from './ExternalTransferScheduleRow';
import { externalTransferMoney } from './external-transfer-presentation';

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
  onAdjust: (adjustment: ExternalTransferScheduleAdjustment) => void;
}
const ExternalTransferFinancialFields: React.FC<Props> = ({
  draft, onChange, context, review, loading, error, disabled, reviewing, canReview, onReview, onRetry, onRestoreDefaults, onAdjust,
}) => {
  const [configurationKey, setConfigurationKey] = useState(0);
  const items = draft.items || [];
  const maximumCycles = context?.maxCiclos || 1;
  const validation = context ? externalTransferFinancialError(draft, context.quantidadeMaxima, maximumCycles) : null;
  const blocked = disabled || loading || Boolean(error) || !context;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-black text-blue-900">Cronograma financeiro individual</h4>
        <p className="mt-1 text-xs text-slate-600">Todas as cobranças em uma lista. Cada ciclo e cada cobrança podem ser ajustados separadamente.</p>
      </div>
      <button type="button" onClick={() => { setConfigurationKey((current) => current + 1); onRestoreDefaults(); }} disabled={blocked}
        className="flex items-center gap-1.5 rounded-lg border border-blue-200 p-2 text-[10px] font-bold text-blue-800 disabled:opacity-40"><RotateCcw size={13} />Restaurar padrões da turma</button>
    </div>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
      <p>{error}</p><button type="button" disabled={loading || disabled} onClick={onRetry} className="mt-2 font-bold underline">Consultar novamente</button>
    </div> : loading || reviewing ? <p role="status" className="flex items-center gap-2 text-xs text-blue-700"><Loader2 size={14} className="animate-spin" />{reviewing ? 'Conferindo o cronograma...' : 'Carregando padrões da turma...'}</p> : null}
    {context && <fieldset disabled={blocked} className="space-y-4">
      <div className="space-y-2">{([1, 2] as const).filter((cycle) => cycle <= maximumCycles).map((cycle) => <ExternalTransferCycleConfigurator key={`${configurationKey}:${cycle}`}
        cycle={cycle} context={context} items={items} disabled={blocked || Boolean(validation)} onApply={onAdjust} />)}</div>
      {items.length === 0 && draft.items !== null && <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600">Sem cobranças planejadas. O recebimento registrará apenas a entrada acadêmica e os aproveitamentos.</p>}
      <div className="space-y-3">{items.map((item, index) => <ExternalTransferScheduleRow key={item.itemId}
        item={item} index={index} maxCiclos={maximumCycles} disabled={blocked}
        canMoveUp={item.tipo === 'PARCELA' && items[index - 1]?.tipo === 'PARCELA' && items[index - 1]?.cicloNumero === item.cicloNumero}
        canMoveDown={item.tipo === 'PARCELA' && items[index + 1]?.tipo === 'PARCELA' && items[index + 1]?.cicloNumero === item.cicloNumero}
        onPatch={(patch) => onChange('items', updateExternalTransferItem(items, item.itemId, patch))}
        onMove={(direction) => onChange('items', moveExternalTransferItem(items, item.itemId, direction))}
        onRemove={() => onChange('items', removeExternalTransferItem(items, item.itemId))}
        onCycle={(cycle) => onChange('items', changeExternalTransferItemCycle(items, item.itemId, cycle))}
      />)}</div>
      <div className="flex flex-wrap gap-2">{([1, 2] as const).filter((cycle) => cycle <= maximumCycles).map((cycle) => <button key={cycle} type="button"
        disabled={blocked || Boolean(validation) || items.filter((item) => item.cicloNumero === cycle && item.tipo === 'PARCELA').length >= context.quantidadeMaxima}
        onClick={() => onAdjust({ acao: 'ADICIONAR_ITEM', itemId: crypto.randomUUID(), cicloNumero: cycle, tipo: 'PARCELA' })}
        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-40"><Plus size={13} />Adicionar mensalidade ao C{cycle}</button>)}</div>
    </fieldset>}
    {validation && !loading && !error && <p role="status" className="text-xs text-amber-800">{validation}</p>}
    {review && <div className="space-y-1 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
      {review.totais.porCiclo.map((total) => <p key={total.cicloNumero}>C{total.cicloNumero}: {total.quantidadeParcelas} mensalidades · {externalTransferMoney(total.totalNominal)}</p>)}
      <p className="font-bold">Total nominal: {externalTransferMoney(review.totais.totalNominal)}</p>
    </div>}
    {(review || context)?.avisos.map((warning, index) => <p key={index} className="text-xs text-amber-800">{warning}</p>)}
    <button type="button" onClick={onReview} disabled={blocked || reviewing || !canReview}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800 disabled:opacity-40">
      {reviewing && <Loader2 size={14} className="animate-spin" />}{reviewing ? 'Conferindo...' : review ? 'Cronograma conferido — consultar novamente' : 'Conferir cronograma financeiro'}
    </button>
  </section>;
};
export default ExternalTransferFinancialFields;
