import { Package } from 'lucide-react';
import { formatPatrimonioCurrency, formatPatrimonioDate, formatPatrimonioQuantity } from '../patrimonio.formatters';
import type { PatrimonioItem } from '../patrimonio.types';

interface PatrimonioTableProps {
  items: PatrimonioItem[];
}

export function PatrimonioTable({ items }: PatrimonioTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <th className="px-5 py-4">Patrimônio</th>
            <th className="px-4 py-4">Aquisição</th>
            <th className="px-4 py-4 text-right">Quantidade</th>
            <th className="px-4 py-4 text-right">Valor unitário</th>
            <th className="px-4 py-4 text-right">Valor total</th>
            <th className="px-5 py-4">Nº de série</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-blue-50/40">
              <td className="px-5 py-4">
                <div className="flex min-w-[250px] items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Package size={17} /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#001a33]" title={item.descricao}>{item.descricao}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">{item.tipoProduto || 'Sem tipo'}</p>
                    {item.observacao && <p className="mt-1 max-w-[340px] truncate text-[11px] text-slate-500" title={item.observacao}>{item.observacao}</p>}
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-xs font-bold text-slate-600">{formatPatrimonioDate(item.dataAquisicao)}</td>
              <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-black text-slate-700">{formatPatrimonioQuantity(item.quantidade)}</td>
              <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-bold text-slate-700">{formatPatrimonioCurrency(item.valorUnitario)}</td>
              <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-black text-emerald-700">{formatPatrimonioCurrency(item.valorTotal)}</td>
              <td className="max-w-[170px] truncate px-5 py-4 text-xs font-semibold text-slate-600" title={item.numeroSerie}>{item.numeroSerie || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
