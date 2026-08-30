import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { BaneseTransaction } from '../conciliacao-bancaria.fetch';
import { formatConciliacaoDate } from '../conciliacao-bancaria.formatters';

interface ConciliacaoTransactionsPanelProps {
  transactions: BaneseTransaction[];
  isUnavailable?: boolean;
}

const ConciliacaoTransactionsPanel: React.FC<ConciliacaoTransactionsPanelProps> = ({
  transactions,
  isUnavailable = false,
}) => (
  <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-center gap-2">
      <AlertCircle size={16} className="text-blue-600" />
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Histórico de retorno persistido</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full overflow-hidden rounded-2xl border border-slate-100 text-left">
        <thead className="bg-slate-50">
          <tr>
            <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Atualização</th>
            <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Cobrança</th>
            <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Status remoto</th>
            <th className="p-3 text-[10px] font-bold uppercase text-slate-500">Pagamento remoto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-4 text-xs text-slate-500">
                {isUnavailable
                  ? 'Histórico temporariamente indisponível.'
                  : 'Ainda sem retorno registrado.'}
              </td>
            </tr>
          ) : transactions.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="p-3 text-xs text-slate-500">{formatConciliacaoDate(row.updatedAt)}</td>
              <td className="p-3 text-xs font-bold text-slate-700">{row.receivableId || '-'}</td>
              <td className="p-3 text-xs text-slate-700">{row.remoteStatus || '-'}</td>
              <td className="p-3 font-mono text-[10px] text-slate-500">{row.remotePaymentId || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

export default ConciliacaoTransactionsPanel;
