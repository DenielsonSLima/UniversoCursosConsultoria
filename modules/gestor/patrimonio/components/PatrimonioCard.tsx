import {
  Barcode,
  CalendarDays,
  Layers3,
  Package,
  PackageMinus,
  Pencil,
  Trash2,
  Wallet,
} from 'lucide-react';
import { formatPatrimonioCurrency, formatPatrimonioDate, formatPatrimonioQuantity } from '../patrimonio.formatters';
import type {
  PatrimonioActionAvailability,
  PatrimonioItem,
  PatrimonioPendingAction,
} from '../patrimonio.types';
import { PatrimonioStatusBadge } from './PatrimonioStatusBadge';

interface PatrimonioCardProps {
  item: PatrimonioItem;
  actions: PatrimonioActionAvailability;
  pendingAction?: PatrimonioPendingAction;
  onEdit: (item: PatrimonioItem) => void;
  onWriteOff: (item: PatrimonioItem) => void;
  onRemove: (item: PatrimonioItem) => void;
}

export function PatrimonioCard({
  item,
  actions,
  pendingAction,
  onEdit,
  onWriteOff,
  onRemove,
}: PatrimonioCardProps) {
  const isBusy = Boolean(pendingAction);
  const availableQuantity = item.status === 'excluido' ? 0 : item.quantidadeDisponivel;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10">
      <div className="relative flex items-start justify-between gap-3 bg-gradient-to-br from-[#001a33] to-[#073b73] px-4 py-4 text-white">
        <div className="min-w-0">
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.16em] text-blue-200">{item.tipoProduto || 'Sem tipo'}</p>
          <h3 className="line-clamp-2 text-base font-black leading-tight">{item.descricao || 'Patrimônio sem descrição'}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <PatrimonioStatusBadge item={item} />
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Package size={17} aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><Layers3 size={12} />Disponível</p>
            <p className="text-sm font-black text-[#001a33]">
              {formatPatrimonioQuantity(availableQuantity)}
              {item.quantidadeBaixada > 0 ? <span className="ml-1 text-[10px] text-slate-400">de {formatPatrimonioQuantity(item.quantidadeOriginal)}</span> : null}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><Wallet size={12} />Valor disponível</p>
            <p className={`text-sm font-black ${availableQuantity > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{formatPatrimonioCurrency(item.valorDisponivel)}</p>
          </div>
        </div>

        {item.quantidadeBaixada > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
            <span>Baixados</span>
            <span>{formatPatrimonioQuantity(item.quantidadeBaixada)} unidade(s)</span>
          </div>
        ) : null}

        <dl className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3 text-slate-500">
            <dt className="flex items-center gap-1.5 font-medium"><CalendarDays size={13} className="text-slate-400" />Aquisição</dt>
            <dd className="font-bold text-slate-700">{formatPatrimonioDate(item.dataAquisicao)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-slate-500">
            <dt className="flex items-center gap-1.5 font-medium"><Wallet size={13} className="text-slate-400" />Valor unitário</dt>
            <dd className="font-bold text-slate-700">{formatPatrimonioCurrency(item.valorUnitario)}</dd>
          </div>
          {item.numeroSerie ? (
            <div className="flex items-center justify-between gap-3 text-slate-500">
              <dt className="flex items-center gap-1.5 font-medium"><Barcode size={13} className="text-slate-400" />Nº de série</dt>
              <dd className="max-w-[58%] truncate font-bold text-slate-700" title={item.numeroSerie}>{item.numeroSerie}</dd>
            </div>
          ) : null}
        </dl>

        {item.observacao ? <p className="line-clamp-2 border-t border-slate-100 pt-3 text-xs text-slate-500" title={item.observacao}>{item.observacao}</p> : null}

        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3" aria-label={`Ações de ${item.descricao}`}>
          <button
            type="button"
            onClick={() => onEdit(item)}
            disabled={!actions.edit.enabled || isBusy}
            title={actions.edit.reason || 'Editar patrimônio'}
            aria-label={`Editar patrimônio ${item.descricao}${actions.edit.reason ? `. ${actions.edit.reason}` : ''}`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wide text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Pencil size={13} aria-hidden="true" />
            {pendingAction === 'edit' ? 'Salvando' : 'Editar'}
          </button>
          <button
            type="button"
            onClick={() => onWriteOff(item)}
            disabled={!actions.writeOff.enabled || isBusy}
            title={actions.writeOff.reason || 'Registrar perda'}
            aria-label={`Registrar perda de ${item.descricao}${actions.writeOff.reason ? `. ${actions.writeOff.reason}` : ''}`}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wide text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <PackageMinus size={13} aria-hidden="true" />
            {pendingAction === 'writeOff' ? 'Registrando' : 'Registrar perda'}
          </button>
          <button
            type="button"
            onClick={() => onRemove(item)}
            disabled={!actions.remove.enabled || isBusy}
            title={actions.remove.reason || 'Excluir patrimônio'}
            aria-label={`Excluir patrimônio ${item.descricao}${actions.remove.reason ? `. ${actions.remove.reason}` : ''}`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-rose-100 text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
