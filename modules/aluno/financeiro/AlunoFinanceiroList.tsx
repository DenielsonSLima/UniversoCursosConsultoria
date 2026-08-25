import React from 'react';
import {
  BadgeAlert,
  CheckCircle,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
} from 'lucide-react';

import FinanceiroCardItem from './FinanceiroCardItem';
import { getBanesePaymentActionLabel, hasRegisteredBaneseBoleto } from './banese/banese-payment.utils';
import {
  formatAlunoFinancialCurrency,
  formatAlunoFinancialDate,
  formatAlunoPaymentMethod,
  getAlunoFinancialModalityAccent,
  getAlunoFinancialModalityClassName,
  getAlunoFinancialModalityLabel,
  isAlunoPaidThroughAsaas,
} from './financeiro.presentation';
import type {
  AlunoFinancialItem,
  AlunoFinancialListPayload,
  AlunoFinancialViewMode,
} from './financeiro.types';

interface AlunoFinanceiroListProps {
  items: AlunoFinancialItem[];
  pagination: AlunoFinancialListPayload['pagination'];
  viewMode: AlunoFinancialViewMode;
  onPageChange: (page: number) => void;
  onCopyLink: (url?: string | null) => void;
  onOpenReceipt: (item: AlunoFinancialItem) => void;
  onPayEad: (item: AlunoFinancialItem) => void;
  onOpenBanese: (item: AlunoFinancialItem) => void;
}

const modalityOrder = ['DISCIPLINA', 'EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS'];

const StatusBadge: React.FC<{ item: AlunoFinancialItem }> = ({ item }) => {
  if (item.statusCode === 'PAGO') {
    return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700"><CheckCircle size={10} /> {item.statusLabel}</span>;
  }
  if (item.statusCode === 'ATRASADO') {
    return <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700"><BadgeAlert size={10} /> {item.statusLabel}</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700"><Clock size={10} /> {item.statusLabel}</span>;
};

const ItemActions: React.FC<{
  item: AlunoFinancialItem;
  onCopyLink: (url?: string | null) => void;
  onOpenReceipt: (item: AlunoFinancialItem) => void;
  onPayEad: (item: AlunoFinancialItem) => void;
  onOpenBanese: (item: AlunoFinancialItem) => void;
}> = ({ item, onCopyLink, onOpenReceipt, onPayEad, onOpenBanese }) => {
  if (item.statusCode === 'ABERTO' || item.statusCode === 'ATRASADO') {
    if (hasRegisteredBaneseBoleto(item)) {
      return (
        <button type="button" onClick={() => onOpenBanese(item)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100">
          <FileText size={12} /> {getBanesePaymentActionLabel(item)}
        </button>
      );
    }
    if (item.modalidade === 'EAD') {
      return (
        <div className="flex justify-start gap-2">
          <button type="button" onClick={() => onPayEad(item)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-100">
            <CreditCard size={12} /> Pagar agora
          </button>
          {item.asaas_invoice_url ? (
            <button type="button" onClick={() => onCopyLink(item.asaas_invoice_url)} className="rounded-lg bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Copiar link</button>
          ) : null}
        </div>
      );
    }
    if (item.asaas_invoice_url) {
      return (
        <div className="flex justify-start gap-2">
          <a href={item.asaas_invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-100">
            <ExternalLink size={12} /> Pagar agora
          </a>
          <button type="button" onClick={() => onCopyLink(item.asaas_invoice_url)} className="rounded-lg bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Copiar link</button>
        </div>
      );
    }
    return <span className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Clock size={12} /> Cobrança em emissão</span>;
  }
  if (item.receiptEligible) {
    return (
      <button type="button" onClick={() => onOpenReceipt(item)} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 hover:bg-emerald-100">
        {isAlunoPaidThroughAsaas(item) ? 'Comprovante' : 'Recibo Universo'}
      </button>
    );
  }
  return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem comprovante</span>;
};

const FinancialDetails: React.FC<{ item: AlunoFinancialItem }> = ({ item }) => {
  const summary = item.financialSummary;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
      {[
        ['Valor da parcela', formatAlunoFinancialCurrency(summary.baseValue)],
        ['Desconto em dia', summary.hasDiscount ? `- ${formatAlunoFinancialCurrency(summary.punctualDiscount)}` : formatAlunoFinancialCurrency(0)],
        ['Total até vencimento', formatAlunoFinancialCurrency(summary.totalUntilDue)],
        [`Juros${summary.interestPercent > 0 ? ` (${summary.interestPercent}%)` : ''}`, formatAlunoFinancialCurrency(summary.interestValue)],
        ['Multa', formatAlunoFinancialCurrency(summary.lateFeeValue)],
        ['Total em atraso', item.isOverdue ? formatAlunoFinancialCurrency(summary.totalWithLate) : '—'],
      ].map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-white px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-black text-[#001a33]">{value}</p>
        </div>
      ))}
    </div>
  );
};

const AlunoFinanceiroList: React.FC<AlunoFinanceiroListProps> = ({
  items,
  pagination,
  viewMode,
  onPageChange,
  onCopyLink,
  onOpenReceipt,
  onPayEad,
  onOpenBanese,
}) => {
  const renderActions = (item: AlunoFinancialItem) => (
    <ItemActions
      item={item}
      onCopyLink={onCopyLink}
      onOpenReceipt={onOpenReceipt}
      onPayEad={onPayEad}
      onOpenBanese={onOpenBanese}
    />
  );
  const groupedItems = modalityOrder.map((modality) => ({
    modality,
    items: items.filter((item) => item.modalidade === modality),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <div className="mt-4 flex flex-col gap-1 text-[11px] font-bold text-slate-500 sm:flex-row sm:justify-between">
        <span>{pagination.totalItems} cobrança{pagination.totalItems === 1 ? '' : 's'} no filtro atual</span>
      </div>
      {viewMode === 'table' ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs font-medium text-slate-500">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="px-4 py-4">Descrição</th><th className="px-4 py-4">Tipo</th><th className="px-4 py-4">Vencimento</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Saldo / pago</th><th className="px-4 py-4">Pagamento</th><th className="px-4 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</td></tr>
              ) : groupedItems.map((group) => (
                <React.Fragment key={group.modality}>
                  <tr><td colSpan={7} className="px-4 pb-2 pt-5"><div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${getAlunoFinancialModalityAccent(group.modality).group}`}><span className="text-[10px] font-black uppercase tracking-[0.24em]">{getAlunoFinancialModalityLabel(group.modality)}</span><span className="text-[10px] font-black uppercase tracking-widest">{group.items.length} cobrança{group.items.length === 1 ? '' : 's'}</span></div></td></tr>
                  {group.items.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr className={`border-b border-l-4 border-slate-100 ${item.modalityAccent.line}`}>
                        <td className="px-4 py-4"><p className="font-black text-slate-800">{item.descricao}</p>{item.isIsolatedDependency ? null : <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.cursoNome} · {item.turmaNome}</p>}</td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${getAlunoFinancialModalityClassName(item.modalidade)}`}>{getAlunoFinancialModalityLabel(item.modalidade)}</span><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{item.chargeKind}</p></td>
                        <td className="px-4 py-4 font-bold">{formatAlunoFinancialDate(item.data_vencimento)}</td>
                        <td className="px-4 py-4"><StatusBadge item={item} /></td>
                        <td className="px-4 py-4"><p className={`text-base font-black ${item.isOverdue ? 'text-rose-600' : 'text-[#001a33]'}`}>{formatAlunoFinancialCurrency(item.financialSummary.highlightValue)}</p><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.financialSummary.highlightLabel}</p></td>
                        <td className="px-4 py-4">{item.statusCode === 'PAGO' ? <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{formatAlunoFinancialDate(item.data_pagamento)} via {formatAlunoPaymentMethod(item.forma_pagamento)}</span> : <span className="text-[10px] font-bold text-slate-400">Aguardando pagamento</span>}</td>
                        <td className="px-4 py-4 text-right">{renderActions(item)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 bg-slate-50/45"><td colSpan={7} className="px-4 py-3"><FinancialDetails item={item} /></td></tr>
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {items.length === 0 ? <div className="px-4 py-12 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</div> : groupedItems.map((group) => (
            <div key={group.modality} className="space-y-3">
              <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${getAlunoFinancialModalityAccent(group.modality).group}`}><h4 className="text-sm font-black uppercase tracking-wider">{getAlunoFinancialModalityLabel(group.modality)}</h4><span className="text-[10px] font-black uppercase tracking-wider opacity-80">{group.items.length} item{group.items.length === 1 ? '' : 's'}</span></div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => <FinanceiroCardItem key={item.id} installment={item} formatCurrency={formatAlunoFinancialCurrency} formatDate={formatAlunoFinancialDate} getModalityLabel={getAlunoFinancialModalityLabel} getModalityClassName={getAlunoFinancialModalityClassName} getInstallmentStatusBadge={() => <StatusBadge item={item} />} onCopyLink={onCopyLink} onOpenReceipt={onOpenReceipt} onPayNow={onPayEad} onOpenBanesePayment={onOpenBanese} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-[11px] font-bold text-slate-500">Página {pagination.currentPage} de {pagination.totalPages}</p>
        <div className="inline-flex items-center gap-2">
          <button type="button" onClick={() => onPageChange(pagination.currentPage - 1)} disabled={pagination.currentPage === 1} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-50">Anterior</button>
          <button type="button" onClick={() => onPageChange(pagination.currentPage + 1)} disabled={pagination.currentPage === pagination.totalPages} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-50">Próxima</button>
        </div>
      </div>
    </>
  );
};

export default AlunoFinanceiroList;
