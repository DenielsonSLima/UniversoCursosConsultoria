import { Package, PackageMinus, Pencil, Trash2 } from 'lucide-react';
import { formatPatrimonioCurrency, formatPatrimonioDate, formatPatrimonioQuantity } from '../patrimonio.formatters';
import type {
  PatrimonioActionAvailability,
  PatrimonioItem,
  PatrimonioPendingAction,
} from '../patrimonio.types';
import { PatrimonioStatusBadge } from './PatrimonioStatusBadge';

interface PatrimonioTableProps {
  items: PatrimonioItem[];
  getActions: (item: PatrimonioItem) => PatrimonioActionAvailability;
  getPendingAction: (item: PatrimonioItem) => PatrimonioPendingAction | undefined;
  onEdit: (item: PatrimonioItem) => void;
  onWriteOff: (item: PatrimonioItem) => void;
  onRemove: (item: PatrimonioItem) => void;
}

export function PatrimonioTable({
  items,
  getActions,
  getPendingAction,
  onEdit,
  onWriteOff,
  onRemove,
}: PatrimonioTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm" tabIndex={0} aria-label="Tabela de patrimônios; deslize horizontalmente para ver todas as colunas">
      <table className="w-full min-w-[1160px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <th className="px-5 py-4">Patrimônio</th>
            <th className="px-4 py-4">Situação</th>
            <th className="px-4 py-4">Aquisição</th>
            <th className="px-4 py-4 text-right">Disponível</th>
            <th className="px-4 py-4 text-right">Valor unitário</th>
            <th className="px-4 py-4 text-right">Valor disponível</th>
            <th className="px-4 py-4">Nº de série</th>
            <th className="sticky right-0 z-[1] border-l border-slate-100 bg-slate-50 px-4 py-4 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const actions = getActions(item);
            const pendingAction = getPendingAction(item);
            const isBusy = Boolean(pendingAction);
            const availableQuantity = item.status === 'excluido' ? 0 : item.quantidadeDisponivel;
            return (
              <tr key={item.id} className="group transition-colors hover:bg-blue-50/40">
                <td className="px-5 py-4">
                  <div className="flex min-w-[240px] items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Package size={17} /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#001a33]" title={item.descricao}>{item.descricao}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">{item.tipoProduto || 'Sem tipo'}</p>
                      {item.observacao ? <p className="mt-1 max-w-[320px] truncate text-[11px] text-slate-500" title={item.observacao}>{item.observacao}</p> : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4"><PatrimonioStatusBadge item={item} /></td>
                <td className="whitespace-nowrap px-4 py-4 text-xs font-bold text-slate-600">{formatPatrimonioDate(item.dataAquisicao)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right">
                  <p className="text-sm font-black text-slate-700">{formatPatrimonioQuantity(availableQuantity)}</p>
                  {item.quantidadeBaixada > 0 ? <p className="mt-0.5 text-[10px] font-semibold text-amber-700">de {formatPatrimonioQuantity(item.quantidadeOriginal)} · {formatPatrimonioQuantity(item.quantidadeBaixada)} baixado(s)</p> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-bold text-slate-700">{formatPatrimonioCurrency(item.valorUnitario)}</td>
                <td className={`whitespace-nowrap px-4 py-4 text-right text-sm font-black ${availableQuantity > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{formatPatrimonioCurrency(item.valorDisponivel)}</td>
                <td className="max-w-[160px] truncate px-4 py-4 text-xs font-semibold text-slate-600" title={item.numeroSerie}>{item.numeroSerie || '—'}</td>
                <td className="sticky right-0 border-l border-slate-100 bg-white px-4 py-3 group-hover:bg-[#f5f9ff]">
                  <div className="flex items-center justify-end gap-1.5" aria-label={`Ações de ${item.descricao}`}>
                    <button type="button" onClick={() => onEdit(item)} disabled={!actions.edit.enabled || isBusy} title={actions.edit.reason || 'Editar patrimônio'} aria-label={`Editar patrimônio ${item.descricao}${actions.edit.reason ? `. ${actions.edit.reason}` : ''}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-blue-100 text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onWriteOff(item)} disabled={!actions.writeOff.enabled || isBusy} title={actions.writeOff.reason || 'Registrar perda'} aria-label={`Registrar perda de ${item.descricao}${actions.writeOff.reason ? `. ${actions.writeOff.reason}` : ''}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-amber-100 text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40">
                      <PackageMinus size={14} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onRemove(item)} disabled={!actions.remove.enabled || isBusy} title={actions.remove.reason || 'Excluir patrimônio'} aria-label={`Excluir patrimônio ${item.descricao}${actions.remove.reason ? `. ${actions.remove.reason}` : ''}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-rose-100 text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                    {pendingAction ? <span className="sr-only" aria-live="polite">Ação em processamento: {pendingAction}</span> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
