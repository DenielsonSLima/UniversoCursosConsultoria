import React from 'react';
import { CalendarDays, CircleDollarSign, GraduationCap, ReceiptText, ExternalLink, Copy, QrCode, FileText } from 'lucide-react';

interface FinanceiroCardItemProps {
  installment: any;
  formatCurrency: (value: number) => string;
  formatDate: (dateStr: string | null) => string;
  getModalityLabel: (modality: string) => string;
  getModalityClassName: (modality: string) => string;
  getInstallmentStatusBadge: (status: string) => React.ReactNode;
  onCopyLink: (url: string) => void;
  onOpenReceipt: (installment: any) => void;
  onOpenPix: (installment: any) => void;
  onOpenBoleto: (installment: any) => void;
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
  onOpenPix,
  onOpenBoleto,
}) => {
  const paymentLabel = [
    installment.turmaNome,
    installment.cursoNome,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const hasReferenceInfo = paymentLabel.length > 0;

  const renderActions = () => {
    if (['PENDENTE', 'VENCIDO'].includes(installment.status)) {
      if (installment.asaas_invoice_url) {
        return (
          <div className="space-y-2">
            <a
              href={installment.asaas_invoice_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-xl px-3 py-2 transition-colors"
            >
              <ExternalLink size={13} />
              Pagar agora
            </a>
            <button
              onClick={() => onCopyLink(installment.asaas_invoice_url)}
              className="inline-flex w-full items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-xl px-3 py-2 transition-colors"
            >
              <Copy size={13} />
              Copiar link
            </button>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          <button
            onClick={() => onOpenPix(installment)}
            className="inline-flex w-full items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-xl px-3 py-2 transition-colors"
          >
            <QrCode size={13} />
            Pagar via PIX
          </button>
          <button
            onClick={() => onOpenBoleto(installment)}
            className="inline-flex w-full items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-xl px-3 py-2 transition-colors"
          >
            <FileText size={13} />
            Boleto
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => onOpenReceipt(installment)}
        className="inline-flex w-full items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-[10px] uppercase tracking-wider rounded-xl px-3 py-2 transition-colors"
      >
        <ReceiptText size={13} />
        Recibo
      </button>
    );
  };

  return (
    <article className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full bg-blue-100/40 blur-2xl" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-2">
          <span className={`inline-flex max-w-[70%] items-center text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${getModalityClassName(installment.modalidade)}`}>
            {getModalityLabel(installment.modalidade)}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            {getInstallmentStatusBadge(installment.status)}
          </div>
        </div>

        <h4 className="text-sm font-black text-[#001a33] leading-snug line-clamp-2">
          {installment.descricao}
        </h4>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 space-y-2 text-[11px] text-slate-600">
          <p className="inline-flex items-start gap-2">
            <GraduationCap size={14} className="text-slate-500 mt-0.5 shrink-0" />
            <span>
              <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Curso / Turma</span>
              <span className="text-slate-700 font-bold">
                {hasReferenceInfo
                  ? paymentLabel.join(' • ')
                  : 'Vinculação em atualização no momento'}
              </span>
            </span>
          </p>

          <p className="inline-flex items-start gap-2">
            <CalendarDays size={14} className="text-slate-500 mt-0.5 shrink-0" />
            <span>
              <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Vencimento</span>
              <span className="font-bold text-slate-700">{formatDate(installment.data_vencimento)}</span>
            </span>
          </p>

          <p className="inline-flex items-start gap-2">
            <CircleDollarSign size={14} className="text-slate-500 mt-0.5 shrink-0" />
            <span>
              <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Valor</span>
              <span className="font-black text-[#001a33]">{formatCurrency(installment.valor)}</span>
            </span>
          </p>

          {installment.status === 'PAGO' && (
            <p className="inline-flex items-start gap-2">
              <span className="text-slate-400 mt-0.5 font-black uppercase text-[10px] tracking-widest min-w-[16px]">•</span>
              <span>
                <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Pagamento</span>
                <span className="font-bold text-slate-700">
                  {formatDate(installment.data_pagamento)} via {installment.forma_pagamento || 'Pix'}
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
