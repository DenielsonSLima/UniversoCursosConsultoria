// File: modules/gestor/financeiro/despesas/components/DespesaTable.tsx

import React from 'react';
import { Edit2, Trash2, CheckCircle2, Clock, AlertCircle, XCircle, Banknote } from 'lucide-react';
import { DespesaLancamento } from '../despesas.service';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const configs: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    PAGO: { label: 'Pago', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    PENDENTE: { label: 'Pendente', className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
    VENCIDO: { label: 'Vencido', className: 'bg-rose-50 text-rose-700 border-rose-200', Icon: AlertCircle },
    CANCELADO: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500 border-slate-200', Icon: XCircle },
  };
  const config = configs[status] || configs.PENDENTE;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${config.className}`}>
      <config.Icon size={10} />
      {config.label}
    </span>
  );
};

interface DespesaTableProps {
  items: DespesaLancamento[];
  onPagar?: (item: DespesaLancamento) => void;
  onExcluir?: (item: DespesaLancamento) => void;
  onImprimir?: (item: DespesaLancamento) => void;
}

const DespesaTable: React.FC<DespesaTableProps> = ({ items, onPagar, onExcluir, onImprimir }) => {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Banknote size={48} className="mx-auto mb-4 opacity-30" />
        <p className="font-bold uppercase tracking-wider text-sm">Nenhum lançamento encontrado</p>
        <p className="text-xs mt-1">Ajuste os filtros ou crie um novo lançamento</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Vencimento</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Categoria</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Fornecedor</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Valor</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Parcela</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors group">
              <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">
                {formatDate(item.dataVencimento)}
                {item.dataPagamento && (
                  <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                    Pago: {formatDate(item.dataPagamento)}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700 max-w-[200px]">
                <div className="font-semibold truncate">{item.descricao}</div>
                {item.turmaNome && (
                  <div className="text-[10px] text-indigo-600 font-bold mt-0.5">Turma: {item.turmaNome}</div>
                )}
                {item.observacao && (
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.observacao}</div>
                )}
              </td>
              <td className="px-4 py-3">
                {item.categoriaNome ? (
                  <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                    {item.categoriaNome}
                  </span>
                ) : (
                  <span className="text-slate-300 text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {item.fornecedorNome || <span className="text-slate-300">—</span>}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <span className="font-black text-slate-800">{formatCurrency(item.valor)}</span>
                {item.valorPago !== undefined && item.valorPago !== item.valor && (
                  <div className="text-[10px] text-emerald-600 font-medium mt-0.5 text-right">
                    Pago: {formatCurrency(item.valorPago)}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {item.totalParcelas > 1 ? (
                  <span className="text-xs text-slate-500 font-bold">
                    {item.parcelaNumero}/{item.totalParcelas}
                  </span>
                ) : (
                  <span className="text-slate-200 text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.status !== 'PAGO' && item.status !== 'CANCELADO' && onPagar && (
                    <button
                      onClick={() => onPagar(item)}
                      className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Dar Baixa"
                    >
                      <CheckCircle2 size={15} />
                    </button>
                  )}
                  {onImprimir && (
                    <button
                      onClick={() => onImprimir(item)}
                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Imprimir Recibo"
                    >
                      <Edit2 size={15} />
                    </button>
                  )}
                  {onExcluir && (
                    <button
                      onClick={() => onExcluir(item)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DespesaTable;
