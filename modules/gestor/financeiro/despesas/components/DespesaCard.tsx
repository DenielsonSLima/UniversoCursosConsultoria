// File: modules/gestor/financeiro/despesas/components/DespesaCard.tsx

import React from 'react';
import { CheckCircle2, Clock, AlertCircle, XCircle, Printer, Trash2, Layers } from 'lucide-react';
import { DespesaLancamento } from '../despesas.service';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string; Icon: React.ElementType }> = {
  PAGO: { label: 'Pago', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', Icon: CheckCircle2 },
  PENDENTE: { label: 'Pendente', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', Icon: Clock },
  VENCIDO: { label: 'Vencido', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', Icon: AlertCircle },
  CANCELADO: { label: 'Cancelado', bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', Icon: XCircle },
};

interface DespesaCardProps {
  item: DespesaLancamento;
  onPagar?: (item: DespesaLancamento) => void;
  onExcluir?: (item: DespesaLancamento) => void;
  onImprimir?: (item: DespesaLancamento) => void;
}

const DespesaCard: React.FC<DespesaCardProps> = ({ item, onPagar, onExcluir, onImprimir }) => {
  const cfg = statusConfig[item.status] || statusConfig.PENDENTE;
  const isPago = item.status === 'PAGO';
  const isCancelado = item.status === 'CANCELADO';

  return (
    <div
      className={`relative bg-white rounded-3xl border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group ${cfg.border}`}
    >
      {/* Top accent stripe */}
      <div className={`h-1 w-full ${isPago ? 'bg-emerald-500' : item.status === 'VENCIDO' ? 'bg-rose-500' : isCancelado ? 'bg-slate-300' : 'bg-amber-400'}`} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-[#001a33] truncate">{item.descricao}</p>
            {item.categoriaNome && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {item.categoriaNome}
              </span>
            )}
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text} border ${cfg.border} flex-shrink-0`}>
            <cfg.Icon size={10} />
            {cfg.label}
          </span>
        </div>

        {/* Valor principal */}
        <div className="mb-3">
          <p className={`text-2xl font-black ${isPago ? 'text-emerald-600' : item.status === 'VENCIDO' ? 'text-rose-600' : 'text-[#001a33]'}`}>
            {formatCurrency(item.valor)}
          </p>
          {item.valorPago !== undefined && item.valorPago !== item.valor && (
            <p className="text-xs text-emerald-600 font-semibold mt-0.5">
              Pago: {formatCurrency(item.valorPago)}
            </p>
          )}
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Vencimento</p>
            <p className="text-xs font-bold text-slate-700">{formatDate(item.dataVencimento)}</p>
          </div>
          {item.dataPagamento && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Pagamento</p>
              <p className="text-xs font-bold text-emerald-600">{formatDate(item.dataPagamento)}</p>
            </div>
          )}
          {item.fornecedorNome && (
            <div className="col-span-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Fornecedor</p>
              <p className="text-xs font-semibold text-slate-600 truncate">{item.fornecedorNome}</p>
            </div>
          )}
          {item.turmaNome && (
            <div className="col-span-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Turma vinculado</p>
              <p className="text-xs font-bold text-indigo-600 truncate">{item.turmaNome}</p>
            </div>
          )}
          {item.totalParcelas > 1 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Parcela</p>
              <div className="flex items-center gap-1">
                <Layers size={10} className="text-slate-400" />
                <p className="text-xs font-bold text-slate-600">{item.parcelaNumero}/{item.totalParcelas}</p>
              </div>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity border-t border-slate-50 pt-3">
          {!isPago && !isCancelado && onPagar && (
            <button
              onClick={() => onPagar(item)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide transition-colors"
            >
              <CheckCircle2 size={12} />
              Dar Baixa
            </button>
          )}
          {onImprimir && (
            <button
              onClick={() => onImprimir(item)}
              className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"
              title="Imprimir Recibo"
            >
              <Printer size={15} />
            </button>
          )}
          {onExcluir && (
            <button
              onClick={() => onExcluir(item)}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              title="Excluir"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DespesaCard;
