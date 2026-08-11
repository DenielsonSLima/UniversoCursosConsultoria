import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  ReceiptText,
} from 'lucide-react';

import type { EmprestimoFinanceiro } from '../emprestimos.types';
import {
  emprestimoStatusClass,
  emprestimoStatusLabel,
  formatEmprestimoContaCredito,
  formatEmprestimoCurrency,
  formatEmprestimoDate,
  getEmprestimoNextParcela,
} from '../emprestimos.presentation';

interface EmprestimoCardProps {
  item: EmprestimoFinanceiro;
  canSettle: boolean;
  onOpen: (item: EmprestimoFinanceiro) => void;
  onSettle: (item: EmprestimoFinanceiro) => void;
}

const EmprestimoCard: React.FC<EmprestimoCardProps> = ({
  item,
  canSettle,
  onOpen,
  onSettle,
}) => {
  const nextParcela = getEmprestimoNextParcela(item);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          aria-label={`Abrir empréstimo ${item.descricao}`}
        >
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">
            <Landmark size={13} /> Empréstimo
          </p>
          <h4 className="mt-1 line-clamp-2 text-base font-black uppercase tracking-tight text-[#001a33]">{item.descricao}</h4>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.credorNome || 'Credor não informado'}</p>
        </button>
        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${emprestimoStatusClass(item.status)}`}>
          {emprestimoStatusLabel(item.status)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onOpen(item)}
        className="mt-5 grid grid-cols-2 gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        aria-label={`Ver detalhes de ${item.descricao}`}
      >
        <span className="rounded-xl bg-slate-50 p-3">
          <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><CircleDollarSign size={12} /> Crédito</span>
          <strong className="mt-1 block text-sm font-black text-[#001a33]">{formatEmprestimoCurrency(item.valorLiberado)}</strong>
        </span>
        <span className="rounded-xl bg-slate-50 p-3">
          <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><ReceiptText size={12} /> Dívida</span>
          <strong className="mt-1 block text-sm font-black text-[#001a33]">{formatEmprestimoCurrency(item.valorTotalDivida)}</strong>
        </span>
      </button>

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
        <p className="mb-2 truncate text-[10px] font-bold text-slate-500" title={formatEmprestimoContaCredito(item.contaCredito)}>
          Crédito em: <span className="font-black text-slate-700">{formatEmprestimoContaCredito(item.contaCredito)}</span>
        </p>
        {nextParcela ? (
          <>
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400"><CalendarDays size={12} /> Próxima parcela</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <span className="text-xs font-bold text-slate-600">{formatEmprestimoDate(nextParcela.dataVencimento)}</span>
              <strong className="text-sm font-black text-[#001a33]">{formatEmprestimoCurrency(nextParcela.valorTotal)}</strong>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Sem parcelas abertas</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.totalParcelas || item.parcelas.length} parcelas</span>
        {canSettle && nextParcela ? (
          <button
            type="button"
            onClick={() => onSettle(item)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"
          >
            <CheckCircle2 size={13} /> Dar baixa
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="text-[10px] font-black uppercase tracking-wide text-indigo-600 hover:text-indigo-800"
          >
            Ver detalhes
          </button>
        )}
      </div>
    </article>
  );
};

export default EmprestimoCard;
