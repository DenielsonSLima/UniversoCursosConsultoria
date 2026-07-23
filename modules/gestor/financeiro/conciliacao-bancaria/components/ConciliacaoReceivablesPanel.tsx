import React from 'react';
import {
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type { BaneseReceivable } from '../conciliacao-bancaria.fetch';
import {
  conciliacaoStatusClass,
  formatConciliacaoCurrency,
  formatConciliacaoDate,
} from '../conciliacao-bancaria.formatters';

interface ConciliacaoReceivablesPanelProps {
  rows: BaneseReceivable[];
  searchTerm: string;
  refreshingIds: string[];
  isLoading: boolean;
  isError: boolean;
  onSearchTermChange: (value: string) => void;
  onRefresh: (receivableId: string) => void;
}

const ConciliacaoReceivablesPanel: React.FC<ConciliacaoReceivablesPanelProps> = ({
  rows,
  searchTerm,
  refreshingIds,
  isLoading,
  isError,
  onSearchTermChange,
  onRefresh,
}) => (
  <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
    <div className="mb-4 flex flex-wrap gap-3">
      <Search size={16} className="mt-3 text-slate-400" />
      <input
        type="text"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Filtrar por descrição, nosso número ou status..."
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
    </div>

    <div className="overflow-x-auto">
      {isLoading ? (
        <div className="py-10 text-center text-sm text-slate-500">Carregando conciliações Banese...</div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-center text-xs font-semibold text-rose-700">
          Não foi possível carregar as cobranças do ambiente bancário ativo.
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-2xl border border-slate-100 text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Descrição</th>
              <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Nosso Número</th>
              <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Vencimento</th>
              <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Valor</th>
              <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Status</th>
              <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Último retorno</th>
              <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs font-bold uppercase text-slate-500">
                  Nenhuma cobrança bancária Banese encontrada para os filtros informados.
                </td>
              </tr>
            ) : rows.map((row) => {
              const isRefreshing = refreshingIds.includes(row.id);
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="p-3">
                    <p className="text-sm font-bold text-slate-700">{row.descricao}</p>
                    {row.gatewayLastError && row.gatewayLastError !== '-' ? (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-rose-600">
                        <ShieldAlert size={12} /> Falha guardada: {row.gatewayLastError}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 text-xs font-bold text-slate-600">{row.nossoNumero || '-'}</td>
                  <td className="p-3 text-xs text-slate-600">{formatConciliacaoDate(row.dataVencimento)}</td>
                  <td className="p-3 text-xs font-black text-slate-700">{formatConciliacaoCurrency(row.valor)}</td>
                  <td className="p-3">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${conciliacaoStatusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{formatConciliacaoDate(row.gatewaySyncedAt)}</td>
                  <td className="p-3">
                    {row.status === 'PAGO' ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                        <CheckCircle2 size={12} /> Confirmado
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRefresh(row.id)}
                        disabled={isRefreshing}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-slate-900 disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                        {isRefreshing ? 'Sincronizando' : 'Sincronizar'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  </section>
);

export default ConciliacaoReceivablesPanel;
