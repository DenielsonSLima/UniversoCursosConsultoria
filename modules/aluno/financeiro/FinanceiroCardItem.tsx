import React from 'react';
import { AlertTriangle, CircleDollarSign, Clock, Copy, ExternalLink, GraduationCap, Percent, ReceiptText } from 'lucide-react';
import { getBanesePaymentActionLabel, hasRegisteredBaneseBoleto } from './banese/banese-payment.utils';
import { isAlunoPaidThroughAsaas } from './financeiro.presentation';
import type { AlunoFinancialItem } from './financeiro.types';

interface FinanceiroCardItemProps {
  installment: AlunoFinancialItem;
  formatCurrency: (value: number) => string;
  formatDate: (dateStr: string | null) => string;
  getModalityLabel: (modality: string) => string;
  getModalityClassName: (modality: string) => string;
  getInstallmentStatusBadge: (status: string) => React.ReactNode;
  onCopyLink: (url: string) => void;
  onOpenReceipt: (installment: AlunoFinancialItem) => void;
  onPayNow?: (installment: AlunoFinancialItem) => void;
  onOpenBanesePayment?: (installment: AlunoFinancialItem) => void;
}

const FinanceiroCardItem: React.FC<FinanceiroCardItemProps> = ({
  installment,
  formatCurrency,
  formatDate,
  getModalityLabel,
  getModalityClassName,
  getInstallmentStatusBadge,
  onCopyLink,
  onOpenReceipt,
  onPayNow,
  onOpenBanesePayment,
}) => {
  const isIsolatedDependency = installment.isIsolatedDependency === true
    || String(installment.tipo_lancamento || '').toUpperCase() === 'DISCIPLINA';
  const paymentLabel = [
    installment.turmaNome,
    installment.cursoNome,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const hasReferenceInfo = paymentLabel.length > 0;
  const summary = installment.financialSummary;
  const accent = installment.modalityAccent || {
    line: 'border-l-blue-500',
    card: 'border-blue-100 bg-white',
    action: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20',
    soft: 'bg-blue-50 text-blue-700 border-blue-100',
  };
  const formatPaymentMethod = (method?: string | null) => {
    const normalized = String(method || '').trim();
    return normalized || 'Forma não informada';
  };

  const renderActions = () => {
    const statusCode = installment.statusCode;
    const isBaneseBoleto = hasRegisteredBaneseBoleto(installment);
    const paymentUrl = installment.gateway_bank_slip_url
      || installment.gateway_invoice_url
      || installment.asaas_invoice_url;

    if (statusCode === 'ABERTO' || statusCode === 'ATRASADO') {
      if (isBaneseBoleto && onOpenBanesePayment) {
        return (
          <button
            onClick={() => onOpenBanesePayment(installment)}
            className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-lg transition-colors ${accent.action}`}
          >
            <ExternalLink size={13} /> {getBanesePaymentActionLabel(installment)}
          </button>
        );
      }
      if (installment.modalidade === 'EAD' && onPayNow) {
        return (
          <div className="space-y-2">
            <button
              onClick={() => onPayNow(installment)}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-lg transition-colors ${accent.action}`}
            >
              <ExternalLink size={13} />
              Pagar agora
            </button>
            {paymentUrl && (
              <button
                onClick={() => onCopyLink(paymentUrl)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-200"
              >
                <Copy size={13} />
                Copiar link
              </button>
            )}
          </div>
        );
      }

      if (paymentUrl) {
        return (
          <div className="space-y-2">
            <a
              href={paymentUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider shadow-lg transition-colors ${accent.action}`}
            >
              <ExternalLink size={13} />
              Pagar agora
            </a>
            <button
              onClick={() => onCopyLink(paymentUrl)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-200"
            >
              <Copy size={13} />
              Copiar link
            </button>
          </div>
        );
      }

      return (
        <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <Clock size={13} />
          Cobrança em emissão
        </div>
      );
    }

    if (statusCode === 'PAGO' && installment.receiptEligible) {
      return (
        <button
          onClick={() => onOpenReceipt(installment)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 transition-colors hover:bg-emerald-100"
        >
          <ReceiptText size={13} />
          {isAlunoPaidThroughAsaas(installment) ? 'Comprovante' : 'Recibo Universo'}
        </button>
      );
    }

    return (
      <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Sem comprovante
      </div>
    );
  };

  return (
    <article className={`relative min-w-0 overflow-hidden rounded-3xl border border-l-4 p-4 shadow-sm transition-shadow hover:shadow-md sm:rounded-[2rem] sm:p-5 ${accent.card} ${accent.line}`}>
      <div className="space-y-4">
        <div className="flex flex-col items-start gap-2 min-[390px]:flex-row min-[390px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${getModalityClassName(installment.modalidade)}`}>
              {getModalityLabel(installment.modalidade)}
            </span>
            <span className="rounded-full border border-slate-100 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              {installment.chargeKind || 'Cobrança'}
            </span>
          </div>
          <div className="shrink-0">
            {getInstallmentStatusBadge(installment.statusCode)}
          </div>
        </div>

        <h4 className="line-clamp-2 break-words text-sm font-black leading-snug text-[#001a33]">
          {installment.descricao}
        </h4>

        <div className="rounded-2xl border border-white/80 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{summary.highlightLabel}</p>
              <p className={`mt-1 text-2xl font-black ${installment.statusCode === 'ATRASADO' ? 'text-rose-600' : 'text-[#001a33]'}`}>
                {formatCurrency(summary.highlightValue)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-left min-[390px]:text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vencimento</p>
              <p className="mt-1 text-xs font-black text-slate-700">{formatDate(installment.data_vencimento)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] text-slate-600">
          {isIsolatedDependency ? null : (
            <div className="mb-3 flex items-start gap-2">
              <GraduationCap size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Curso / Turma</span>
                <span className="block break-words font-bold text-slate-700">
                  {hasReferenceInfo ? paymentLabel.join(' • ') : 'Vinculação em atualização no momento'}
                </span>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
            <div className="rounded-xl bg-white px-3 py-2">
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <CircleDollarSign size={11} /> Parcela
              </span>
              <p className="mt-1 text-sm font-black text-[#001a33]">{formatCurrency(summary.baseValue)}</p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2">
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <Percent size={11} /> Desconto em dia
              </span>
              <p className={`mt-1 text-sm font-black ${summary.hasDiscount ? 'text-emerald-600' : 'text-slate-400'}`}>
                {summary.hasDiscount ? `- ${formatCurrency(summary.punctualDiscount)}` : formatCurrency(0)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 min-[390px]:col-span-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Pagando até o vencimento</span>
              <p className="mt-1 text-lg font-black text-emerald-700">{formatCurrency(summary.totalUntilDue)}</p>
            </div>
            {(installment.statusCode === 'ATRASADO' || summary.hasLateCharge) && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 min-[390px]:col-span-2">
                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-rose-700">
                  <AlertTriangle size={11} /> Juros e multa
                </span>
                <p className="mt-1 text-xs font-bold text-rose-700">
                  Juros {formatCurrency(summary.interestValue)} + multa {formatCurrency(summary.lateFeeValue)}
                </p>
              </div>
            )}
          </div>

          {installment.statusCode === 'PAGO' && (
            <p className="mt-3 inline-flex items-start gap-2">
              <span className="text-slate-400 mt-0.5 font-black uppercase text-[10px] tracking-widest min-w-[16px]">•</span>
              <span>
                <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Pagamento</span>
                <span className="font-bold text-slate-700">
                  {formatDate(installment.data_pagamento)} via {formatPaymentMethod(installment.forma_pagamento)}
                </span>
              </span>
            </p>
          )}
        </div>

        <div>{renderActions()}</div>
      </div>
    </article>
  );
};

export default FinanceiroCardItem;
