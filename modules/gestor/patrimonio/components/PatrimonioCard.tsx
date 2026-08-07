import { Barcode, CalendarDays, Layers3, Package, Wallet } from 'lucide-react';
import { formatPatrimonioCurrency, formatPatrimonioDate, formatPatrimonioQuantity } from '../patrimonio.formatters';
import type { PatrimonioItem } from '../patrimonio.types';

interface PatrimonioCardProps {
  item: PatrimonioItem;
}

export function PatrimonioCard({ item }: PatrimonioCardProps) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10">
      <div className="relative flex items-start justify-between gap-4 bg-gradient-to-br from-[#001a33] to-[#073b73] px-5 py-4 text-white">
        <div className="min-w-0">
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.16em] text-blue-200">{item.tipoProduto || 'Sem tipo'}</p>
          <h3 className="line-clamp-2 text-base font-black leading-tight">{item.descricao || 'Patrimônio sem descrição'}</h3>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
          <Package size={19} aria-hidden="true" />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><Layers3 size={12} />Quantidade</p>
            <p className="text-sm font-black text-[#001a33]">{formatPatrimonioQuantity(item.quantidade)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><Wallet size={12} />Total canônico</p>
            <p className="text-sm font-black text-emerald-700">{formatPatrimonioCurrency(item.valorTotal)}</p>
          </div>
        </div>

        <dl className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3 text-slate-500">
            <dt className="flex items-center gap-1.5 font-medium"><CalendarDays size={13} className="text-slate-400" />Aquisição</dt>
            <dd className="font-bold text-slate-700">{formatPatrimonioDate(item.dataAquisicao)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-slate-500">
            <dt className="flex items-center gap-1.5 font-medium"><Wallet size={13} className="text-slate-400" />Valor unitário</dt>
            <dd className="font-bold text-slate-700">{formatPatrimonioCurrency(item.valorUnitario)}</dd>
          </div>
          {item.numeroSerie && (
            <div className="flex items-center justify-between gap-3 text-slate-500">
              <dt className="flex items-center gap-1.5 font-medium"><Barcode size={13} className="text-slate-400" />Nº de série</dt>
              <dd className="max-w-[58%] truncate font-bold text-slate-700" title={item.numeroSerie}>{item.numeroSerie}</dd>
            </div>
          )}
        </dl>

        {(item.poloNome || item.observacao) && (
          <div className="border-t border-slate-100 pt-3 text-xs">
            {item.poloNome && <p className="font-bold text-blue-700">Polo: {item.poloNome}</p>}
            {item.observacao && <p className="mt-1 line-clamp-2 text-slate-500" title={item.observacao}>{item.observacao}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
