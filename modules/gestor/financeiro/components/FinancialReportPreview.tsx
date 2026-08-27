import React, { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';

import { empresasService } from '../../configuracoes/empresas/empresas.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import ReportPdfPreviewModal, {
  reportPdfPreviewToneStyles,
  type ReportPdfFactory,
} from '../../relatorios/pdf/ReportPdfPreviewModal';
import {
  buildFinancialReportPdf,
  getFinancialReportPdfFileName,
  type FinancialReportPdfInput,
} from './financial-report.vector-pdf';
import type { FinancialReportPdfTextComponent } from './financial-report.vector-pdf.resources';

export type {
  FinancialReportColumn,
  FinancialReportFilter,
  FinancialReportRow,
  FinancialReportSummaryCard,
  FinancialReportTone,
} from './financial-report.vector-pdf';

interface FinancialReportPreviewModalProps extends FinancialReportPdfInput {
  poloId?: string | null;
  onClose: () => void;
}

interface FinancialReportExportButtonProps extends Omit<FinancialReportPreviewModalProps, 'onClose'> {
  buttonLabel?: string;
  buttonClassName?: string;
  disabled?: boolean;
  onBeforeOpen?: () => Promise<void>;
}

const statusStyles: Record<string, string> = {
  PAGO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECEBIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  VENCIDO: 'bg-rose-50 text-rose-700 border-rose-200',
  SUSPENSO: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELADO: 'bg-slate-100 text-slate-500 border-slate-200',
  ESTORNADO: 'bg-slate-100 text-slate-500 border-slate-200',
  DEVOLVIDO: 'bg-slate-100 text-slate-500 border-slate-200',
};

const currentSessionPoloId = () => {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id') || '';
};

interface FinancialReportStatusBadgeProps {
  status: string;
  label?: string;
}

const financialReportStatusText = ({ status, label }: FinancialReportStatusBadgeProps) => (
  label || String(status || 'PENDENTE').toUpperCase()
);

export const FinancialReportStatusBadge = (({ status, label }: FinancialReportStatusBadgeProps) => {
  const normalized = String(status || 'PENDENTE').toUpperCase();
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${statusStyles[normalized] || statusStyles.PENDENTE}`}>
      {label || normalized}
    </span>
  );
}) as FinancialReportPdfTextComponent<FinancialReportStatusBadgeProps>;

FinancialReportStatusBadge.pdfText = financialReportStatusText;

const FinancialReportPreviewModal: React.FC<FinancialReportPreviewModalProps> = ({
  poloId,
  onClose,
  ...reportInput
}) => {
  const queryClient = useQueryClient();
  const reportInputRef = useRef(reportInput);
  reportInputRef.current = reportInput;
  const resolvedPoloId = poloId || currentSessionPoloId();

  const preparePdf = useCallback<ReportPdfFactory>(async (reportProgress) => {
    const input = reportInputRef.current;
    reportProgress('Carregando identidade visual...');

    let reportCompany = input.company;
    let reportPolo = input.polo;
    try {
      [reportCompany, reportPolo] = await Promise.all([
        reportCompany || queryClient.fetchQuery({
          queryKey: ['financeiro-report-company-principal'],
          queryFn: () => empresasService.getCompanyPrincipal(),
          staleTime: 60_000,
          gcTime: 10 * 60_000,
        }),
        reportPolo || (resolvedPoloId
          ? queryClient.fetchQuery({
            queryKey: ['financeiro-report-polo', resolvedPoloId],
            queryFn: () => polosService.getById(resolvedPoloId),
            staleTime: 0,
            gcTime: 10 * 60_000,
          })
          : Promise.resolve(null)),
      ]);
    } catch (failure) {
      console.error('Não foi possível carregar a identidade visual do relatório:', failure);
      throw new Error(
        'Não foi possível carregar a identidade visual do relatório. Atualize a página e tente novamente.',
        { cause: failure },
      );
    }

    const blob = await buildFinancialReportPdf({
      ...input,
      company: reportCompany,
      polo: reportPolo,
      issuedAt: input.issuedAt ?? new Date(),
    }, ({ current, total }) => {
      reportProgress(`Gerando página ${current} de ${total}...`);
    });

    return {
      blob,
      fileName: getFinancialReportPdfFileName(input.fileName),
    };
  }, [queryClient, resolvedPoloId]);

  return (
    <ReportPdfPreviewModal
      title={reportInput.title}
      description={`${reportInput.rows.length} ${reportInput.recordLabel || 'registro(s)'} · prévia, download e impressão usam o mesmo PDF`}
      tone={reportInput.tone}
      preparePdf={preparePdf}
      onClose={onClose}
    />
  );
};

const FinancialReportExportButton: React.FC<FinancialReportExportButtonProps> = ({
  buttonLabel = 'Extrato PDF',
  buttonClassName = '',
  disabled,
  onBeforeOpen,
  tone = 'slate',
  ...modalProps
}) => {
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const toneStyle = reportPdfPreviewToneStyles[tone];

  const handleOpen = async () => {
    if (preparing) return;
    try {
      setPreparing(true);
      await onBeforeOpen?.();
      setOpen(true);
    } catch {
      // A tela chamadora apresenta a mensagem de consulta específica.
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled || preparing}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneStyle.button} ${buttonClassName}`}
        title="Abrir prévia do relatório em PDF"
      >
        {preparing ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
        {preparing ? 'Preparando...' : buttonLabel}
      </button>
      {open ? (
        <FinancialReportPreviewModal
          {...modalProps}
          tone={tone}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
};

export default FinancialReportExportButton;
