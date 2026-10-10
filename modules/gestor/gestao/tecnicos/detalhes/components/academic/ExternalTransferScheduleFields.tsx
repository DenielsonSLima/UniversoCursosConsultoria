import React from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { ExternalTransferPreview, ExternalTransferScheduleAdjustment } from './external-transfer.contract';
import {
  changeExternalTransferItemCycle, externalTransferFinancialError, moveExternalTransferItem, removeExternalTransferItem,
  updateExternalTransferItem, type ExternalTransferDraft,
} from './external-transfer-draft';
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
  onRetry: () => void;
  onAdjust: (adjustment: ExternalTransferScheduleAdjustment) => void;
}
const ExternalTransferScheduleFields: React.FC<Props> = ({ draft, onChange, context, review, loading, error, disabled, onRetry, onAdjust }) => {
  const items = draft.items || [];
  const maximumCycles = context?.maxCiclos || 1;
  const validation = context ? externalTransferFinancialError(draft, context.quantidadeMaxima, maximumCycles) : null;
  const blocked = disabled || loading || Boolean(error) || !context;
  return <section className="space-y-4">
    <div><h4 className="text-sm font-black text-blue-900">Conferir e ajustar as cobranças</h4>
      <p className="mt-1 text-xs text-slate-600">Todos os ciclos estão nesta lista. Cada cobrança mantém seu valor, vencimento e condições individuais.</p>
    </div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
      <p>{error}</p><button type="button" disabled={loading || disabled} onClick={onRetry} className="mt-2 font-bold underline">Consultar novamente</button>
    </div>}
    {loading && <p role="status" className="flex items-center gap-2 text-xs text-blue-700"><Loader2 size={14} className="animate-spin" />Conferindo o cronograma...</p>}
    <fieldset disabled={blocked} className="space-y-2">
      {items.length === 0 && draft.items !== null && <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600">Sem cobranças planejadas. O recebimento registrará apenas a entrada acadêmica e os aproveitamentos.</p>}
      {items.map((item, index) => <ExternalTransferScheduleRow key={item.itemId}
        item={item} index={index} maxCiclos={maximumCycles} disabled={blocked}
        canMoveUp={item.tipo === 'PARCELA' && items[index - 1]?.tipo === 'PARCELA' && items[index - 1]?.cicloNumero === item.cicloNumero}
        canMoveDown={item.tipo === 'PARCELA' && items[index + 1]?.tipo === 'PARCELA' && items[index + 1]?.cicloNumero === item.cicloNumero}
        onPatch={(patch) => onChange('items', updateExternalTransferItem(items, item.itemId, patch))}
        onMove={(direction) => onChange('items', moveExternalTransferItem(items, item.itemId, direction))}
        onRemove={() => onChange('items', removeExternalTransferItem(items, item.itemId))}
        onCycle={(cycle) => onChange('items', changeExternalTransferItemCycle(items, item.itemId, cycle))} />)}
      {context && <div className="flex flex-wrap gap-2 pt-2">
        {([1, 2] as const).filter((cycle) => cycle <= maximumCycles).map((cycle) => {
          const type = cycle === 1 ? 'MATRICULA' : 'REMATRICULA';
          const amount = cycle === 1 ? context.regra.valorMatricula : context.regra.valorRematricula;
          return <React.Fragment key={cycle}>
            <button type="button" disabled={blocked || Boolean(validation) || items.filter((item) => item.cicloNumero === cycle && item.tipo === 'PARCELA').length >= context.quantidadeMaxima}
              onClick={() => onAdjust({ acao: 'ADICIONAR_ITEM', itemId: crypto.randomUUID(), cicloNumero: cycle, tipo: 'PARCELA' })}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-40"><Plus size={13} />Adicionar mensalidade ao C{cycle}</button>
            {!items.some((item) => item.cicloNumero === cycle && item.tipo === type) && <button type="button"
              disabled={blocked || Boolean(validation) || Number(amount) <= 0}
              title={Number(amount) <= 0 ? 'Defina o valor e o vencimento desta taxa na configuração anterior.' : 'Adicionar com o valor padrão da turma; você poderá editar nesta lista.'}
              onClick={() => onAdjust({ acao: 'ADICIONAR_ITEM', itemId: crypto.randomUUID(), cicloNumero: cycle, tipo: type, valor: amount })}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"><Plus size={13} />Adicionar {cycle === 1 ? 'matrícula' : 'rematrícula'} ao C{cycle}</button>}
          </React.Fragment>;
        })}
      </div>}
    </fieldset>
    {validation && !loading && !error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{validation}</p>}
    {review && !validation && <div className="space-y-1 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
      {review.totais.porCiclo.map((total) => <p key={total.cicloNumero}>C{total.cicloNumero}: {total.quantidadeParcelas} mensalidades · {externalTransferMoney(total.totalNominal)}</p>)}
      <p className="font-bold">Total nominal: {externalTransferMoney(review.totais.totalNominal)}</p>
    </div>}
    {!review && items.length > 0 && !validation && <p className="text-xs text-slate-500">As alterações serão conferidas automaticamente ao avançar para a revisão.</p>}
  </section>;
};
export default ExternalTransferScheduleFields;
