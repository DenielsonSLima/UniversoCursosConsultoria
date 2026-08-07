import React from 'react';
import {
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Landmark,
  ReceiptText,
  TriangleAlert,
} from 'lucide-react';
import type { EmprestimoFinanceiro, EmprestimoParcela } from '../emprestimos.types';

const formatCurrency = (value: number) => (
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
);

const formatDate = (value?: string) => (
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—'
);

const statusClass = (status: string) => {
  if (status === 'PAGO' || status === 'QUITADO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'CANCELADO') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const statusLabel = (status: string) => (
  status === 'QUITADO' ? 'Quitado' : status.charAt(0) + status.slice(1).toLowerCase()
);

interface EmprestimosTableProps {
  items: EmprestimoFinanceiro[];
  canSettle: boolean;
  onDetails: (item: EmprestimoFinanceiro) => void;
  onSettle: (item: EmprestimoFinanceiro, parcela: EmprestimoParcela) => void;
}

const EmprestimosTable: React.FC<EmprestimosTableProps> = ({
  items,
  canSettle,
  onDetails,
  onSettle,
}) => {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
        <Landmark size={46} className="mx-auto mb-4 opacity-30" />
        <p className="text-sm font-black uppercase tracking-wider">Nenhum empréstimo encontrado</p>
        <p className="mt-1 text-xs font-medium">Os contratos do polo responsável aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Contrato</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Liberação</th>
            <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">Dívida</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Próxima parcela</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
            <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((item) => {
            const nextParcela = item.parcelas.find(
              (parcela) => parcela.status === 'PENDENTE' || parcela.status === 'VENCIDO',
            );
            return (
              <tr key={item.id} className="group transition-colors hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <p className="max-w-[250px] truncate text-sm font-black text-[#001a33]">{item.descricao}</p>
                  <p className="mt-0.5 max-w-[250px] truncate text-xs font-medium text-slate-500">{item.credorNome || 'Credor não informado'}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">{formatDate(item.dataLiberacao)}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                    Crédito: {formatCurrency(item.valorLiberado)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-black text-[#001a33]">{formatCurrency(item.valorTotalDivida)}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">{item.totalParcelas || item.parcelas.length} parcelas</p>
                </td>
                <td className="px-4 py-3">
                  {nextParcela ? (
                    <>
                      <p className="text-sm font-semibold text-slate-700">{formatDate(nextParcela.dataVencimento)}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-indigo-600"><ReceiptText size={11} /> {formatCurrency(nextParcela.valorTotal)}</p>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Sem parcelas abertas</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onDetails(item)}
                      title="Ver contrato e rateio"
                      className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Eye size={14} />
                    </button>
                    {canSettle && nextParcela && (
                      <button
                        type="button"
                        onClick={() => onSettle(item, nextParcela)}
                        title="Dar baixa da próxima parcela"
                        className={`rounded-lg border p-2 transition-colors ${
                          nextParcela.status === 'VENCIDO'
                            ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                        }`}
                      >
                        {nextParcela.status === 'VENCIDO' ? <TriangleAlert size={14} /> : <CircleDollarSign size={14} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EmprestimosTable;
