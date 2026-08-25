import React from 'react';
import {
  BadgeAlert,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import {
  formatProfessorFinancialCurrency,
  formatProfessorFinancialDate,
  professorFinancialPoloLocation,
} from './financeiro.presentation';
import type {
  ProfessorFinancialListPayload,
  ProfessorFinancialPayment,
  ProfessorFinancialViewMode,
} from './financeiro.types';

interface FinanceiroPaymentsListProps {
  items: ProfessorFinancialPayment[];
  pagination: ProfessorFinancialListPayload['pagination'];
  viewMode: ProfessorFinancialViewMode;
  onPageChange: (page: number) => void;
  onOpenReceipt: (paymentId: string) => void;
}

const StatusBadge: React.FC<{ payment: ProfessorFinancialPayment }> = ({ payment }) => {
  if (payment.statusCode === 'PAGO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
        <CheckCircle2 size={10} /> {payment.statusLabel}
      </span>
    );
  }
  if (payment.statusCode === 'ATRASADO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700">
        <BadgeAlert size={10} /> {payment.statusLabel}
      </span>
    );
  }
  if (payment.statusCode === 'ABERTO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
        <Clock size={10} /> {payment.statusLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
      {payment.statusLabel}
    </span>
  );
};

const ReceiptAction: React.FC<{
  payment: ProfessorFinancialPayment;
  fullWidth?: boolean;
  onOpen: (paymentId: string) => void;
}> = ({ payment, fullWidth = false, onOpen }) => {
  if (!payment.receiptEligible) {
    return <span className="text-[10px] font-bold text-slate-400">Aguardando baixa</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(payment.id)}
      className={`${fullWidth ? 'w-full justify-center' : ''} inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100`}
    >
      <ReceiptText size={13} /> Recibo PDF
    </button>
  );
};

const PaymentTable: React.FC<{
  items: ProfessorFinancialPayment[];
  onOpenReceipt: (paymentId: string) => void;
}> = ({ items, onOpenReceipt }) => (
  <div className="mt-4 overflow-x-auto">
    <table className="w-full text-left text-xs font-medium text-slate-500">
      <thead>
        <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
          <th className="px-4 py-4">Lançamento</th>
          <th className="px-4 py-4">Categoria</th>
          <th className="px-4 py-4">Vencimento</th>
          <th className="px-4 py-4">Valor previsto</th>
          <th className="px-4 py-4">Status</th>
          <th className="px-4 py-4">Pagamento</th>
          <th className="px-4 py-4 text-right">Recibo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((payment) => (
          <tr key={payment.id} className="transition-colors hover:bg-slate-50/50">
            <td className="px-4 py-4">
              <p className="font-bold text-slate-800">{payment.description}</p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">{payment.polo.name}</p>
            </td>
            <td className="px-4 py-4">
              <span className="inline-flex rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-purple-700">
                {payment.category}
              </span>
            </td>
            <td className="px-4 py-4">{formatProfessorFinancialDate(payment.dueDate)}</td>
            <td className="px-4 py-4 font-bold text-[#001a33]">
              {formatProfessorFinancialCurrency(payment.valueExpected)}
            </td>
            <td className="px-4 py-4"><StatusBadge payment={payment} /></td>
            <td className="px-4 py-4">
              {payment.receiptEligible ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {formatProfessorFinancialDate(payment.paymentDate)} · {payment.paymentMethod || 'Não informada'}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">—</span>
              )}
            </td>
            <td className="px-4 py-4 text-right">
              <ReceiptAction payment={payment} onOpen={onOpenReceipt} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const PaymentCards: React.FC<{
  items: ProfessorFinancialPayment[];
  onOpenReceipt: (paymentId: string) => void;
}> = ({ items, onOpenReceipt }) => (
  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {items.map((payment) => (
      <article key={payment.id} className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-purple-100/50 blur-2xl" />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex max-w-[68%] rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-purple-700">
              {payment.category}
            </span>
            <StatusBadge payment={payment} />
          </div>
          <h4 className="line-clamp-2 text-sm font-black leading-snug text-[#001a33]">
            {payment.description}
          </h4>
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] text-slate-600">
            <p className="inline-flex items-start gap-2">
              <CalendarDays size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <span><strong className="block text-[10px] uppercase tracking-widest text-slate-400">Vencimento</strong>{formatProfessorFinancialDate(payment.dueDate)}</span>
            </p>
            <p className="inline-flex items-start gap-2">
              <WalletCards size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <span><strong className="block text-[10px] uppercase tracking-widest text-slate-400">Valor previsto</strong>{formatProfessorFinancialCurrency(payment.valueExpected)}</span>
            </p>
            <p className="inline-flex items-start gap-2">
              <FileText size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <span>
                <strong className="block text-[10px] uppercase tracking-widest text-slate-400">Polo</strong>
                {payment.polo.name}{professorFinancialPoloLocation(payment) ? ` · ${professorFinancialPoloLocation(payment)}` : ''}
              </span>
            </p>
            <p>
              <strong className="block text-[10px] uppercase tracking-widest text-slate-400">
                {payment.receiptEligible ? 'Valor pago' : 'Saldo em aberto'}
              </strong>
              <span className="font-black text-[#001a33]">
                {formatProfessorFinancialCurrency(
                  payment.receiptEligible ? payment.valuePaid : payment.valueOutstanding,
                )}
              </span>
            </p>
          </div>
          <ReceiptAction payment={payment} fullWidth onOpen={onOpenReceipt} />
        </div>
      </article>
    ))}
  </div>
);

const FinanceiroPaymentsList: React.FC<FinanceiroPaymentsListProps> = ({
  items,
  pagination,
  viewMode,
  onPageChange,
  onOpenReceipt,
}) => (
  <>
    <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-slate-500">
      <span>{pagination.totalItems} lançamento{pagination.totalItems === 1 ? '' : 's'} no filtro atual</span>
    </div>
    {items.length === 0 ? (
      <div className="px-4 py-12 text-center text-xs font-bold text-slate-400">
        Nenhum lançamento encontrado com os filtros atuais.
      </div>
    ) : viewMode === 'table' ? (
      <PaymentTable items={items} onOpenReceipt={onOpenReceipt} />
    ) : (
      <PaymentCards items={items} onOpenReceipt={onOpenReceipt} />
    )}
    <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-[11px] font-bold text-slate-500">
        Página {pagination.currentPage} de {pagination.totalPages}
      </p>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage === 1}
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(pagination.currentPage + 1)}
          disabled={pagination.currentPage === pagination.totalPages}
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Próxima
        </button>
      </div>
    </div>
  </>
);

export default FinanceiroPaymentsList;
