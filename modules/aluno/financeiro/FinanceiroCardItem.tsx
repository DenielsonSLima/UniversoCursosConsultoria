import React from 'react';
import { AlertTriangle, ChevronDown, CircleDollarSign, Clock, Copy, ExternalLink, GraduationCap, Percent, ReceiptText } from 'lucide-react';
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
            className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${accent.action}`}
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
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${accent.action}`}
            >
              <ExternalLink size={13} />
              Pagar agora
            </button>
            {paymentUrl && (
              <button
                onClick={() => onCopyLink(paymentUrl)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-200"
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
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${accent.action}`}
            >
              <ExternalLink size={13} />
              Pagar agora
            </a>
            <button
              onClick={() => onCopyLink(paymentUrl)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-200"
            >
              <Copy size={13} />
              Copiar link
            </button>
          </div>
        );
      }

      return (
        <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          <Clock size={13} />
          Cobrança em emissão
        </div>
      );
    }

    if (statusCode === 'PAGO' && installment.receiptEligible) {
      return (
        <button
          onClick={() => onOpenReceipt(installment)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-100"
        >
          <ReceiptText size={13} />
          {isAlunoPaidThroughAsaas(installment) ? 'Comprovante' : 'Recibo Universo'}
        </button>
      );
    }

    return (
      <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
        Sem comprovante
      </div>
    );
  };

  return (
    <article className={`relative min-w-0 overflow-hidden rounded-xl border border-l-4 p-4 text-[13px] ${accent.card} ${accent.line}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getModalityClassName(installment.modalidade)}`}>
              {getModalityLabel(installment.modalidade)}
            </span>
            <span className="rounded-full border border-slate-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
              {installment.chargeKind || 'Cobrança'}
            </span>
          </div>
          <div className="shrink-0">
            {getInstallmentStatusBadge(installment.statusCode)}
          </div>
        </div>

        <h4 className="break-words text-sm font-medium leading-snug text-[#001a33]">
          {installment.descricao}
        </h4>

        <div className="border-y border-slate-100 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-600">{summary.highlightLabel}</p>
              <p className={`mt-1 break-words text-xl font-semibold ${installment.statusCode === 'ATRASADO' ? 'text-rose-600' : 'text-[#001a33]'}`}>
                {formatCurrency(summary.highlightValue)}
              </p>
            </div>
            <div className="text-left">
              <p className="text-xs font-medium text-slate-600">Vencimento</p>
              <p className="mt-1 text-xs font-medium text-slate-700">{formatDate(installment.data_vencimento)}</p>
            </div>
          </div>
        </div>

        <div>{renderActions()}</div>

        <details className="group text-xs text-slate-600">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-1 font-medium text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">Detalhes da cobrança <ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary>
          <div className="rounded-lg bg-slate-50 p-3">
            {isIsolatedDependency ? null : (
              <div className="mb-3 flex items-start gap-2">
                <GraduationCap size={14} className="mt-0.5 shrink-0 text-slate-500" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-600">Curso / Turma</span>
                  <span className="block break-words font-medium text-slate-700">
                    {hasReferenceInfo ? paymentLabel.join(' • ') : 'Vinculação em atualização no momento'}
                  </span>
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
              <div className="rounded-xl bg-white px-3 py-2">
                <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                  <CircleDollarSign size={11} /> Parcela
                </span>
                <p className="mt-1 text-sm font-medium text-[#001a33]">{formatCurrency(summary.baseValue)}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                  <Percent size={11} /> Desconto em dia
                </span>
                <p className={`mt-1 text-sm font-medium ${summary.hasDiscount ? 'text-emerald-600' : 'text-slate-600'}`}>
                  {summary.hasDiscount ? `- ${formatCurrency(summary.punctualDiscount)}` : formatCurrency(0)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 min-[390px]:col-span-2">
                <span className="text-xs font-medium text-emerald-700">Pagando até o vencimento</span>
                <p className="mt-1 text-lg font-medium text-emerald-700">{formatCurrency(summary.totalUntilDue)}</p>
              </div>
              {(installment.statusCode === 'ATRASADO' || summary.hasLateCharge) && (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 min-[390px]:col-span-2">
                  <span className="flex items-center gap-1 text-xs font-medium text-rose-700">
                    <AlertTriangle size={11} /> Juros e multa
                  </span>
                  <p className="mt-1 text-xs font-medium text-rose-700">
                    Juros {formatCurrency(summary.interestValue)} + multa {formatCurrency(summary.lateFeeValue)}
                  </p>
                </div>
              )}
            </div>

            {installment.statusCode === 'PAGO' && (
              <p className="mt-3 inline-flex items-start gap-2">
                <span className="text-slate-600 mt-0.5 font-medium text-xs min-w-[16px]">•</span>
                <span>
                  <span className="block text-slate-600 text-xs font-medium">Pagamento</span>
                  <span className="font-medium text-slate-700">
                    {formatDate(installment.data_pagamento)} via {formatPaymentMethod(installment.forma_pagamento)}
                  </span>
                </span>
              </p>
            )}
          </div>
        </details>
      </div>
    </article>
  );
};

export default FinanceiroCardItem;
