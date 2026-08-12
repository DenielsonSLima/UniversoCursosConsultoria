import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';

import { empresasService } from '../../configuracoes/empresas/empresas.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { assertPdfBlobReady, printPdfBlob } from '../../secretaria/shared/pdf-blob-print';
import {
  buildFinancialReportPdf,
  getFinancialReportPdfFileName,
  type FinancialReportPdfInput,
  type FinancialReportTone,
} from './financial-report.vector-pdf';

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

interface PreparedFinancialReportPdf {
  blob: Blob;
  fileName: string;
}

const toneStyles: Record<FinancialReportTone, { button: string; soft: string; text: string }> = {
  emerald: {
    button: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    soft: 'bg-emerald-50 text-emerald-700',
    text: 'text-emerald-700',
  },
  rose: {
    button: 'border-rose-200 text-rose-700 hover:bg-rose-50',
    soft: 'bg-rose-50 text-rose-700',
    text: 'text-rose-700',
  },
  blue: {
    button: 'border-blue-200 text-blue-700 hover:bg-blue-50',
    soft: 'bg-blue-50 text-blue-700',
    text: 'text-blue-700',
  },
  slate: {
    button: 'border-slate-200 text-slate-700 hover:bg-slate-50',
    soft: 'bg-slate-100 text-slate-700',
    text: 'text-[#001a33]',
  },
  amber: {
    button: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    soft: 'bg-amber-50 text-amber-700',
    text: 'text-amber-700',
  },
};

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

export const FinancialReportStatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const normalized = String(status || 'PENDENTE').toUpperCase();
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${statusStyles[normalized] || statusStyles.PENDENTE}`}>
      {label || normalized}
    </span>
  );
};

/**
 * A prévia só recebe um Blob já composto pelo gerador vetorial. Download e
 * impressão reutilizam a mesma instância, evitando divergência entre tela,
 * arquivo salvo e documento impresso.
 */
const FinancialReportPreviewModal: React.FC<FinancialReportPreviewModalProps> = ({
  title,
  subtitle,
  rightTitle,
  rightType,
  fileName,
  columns,
  rows,
  summaryCards,
  filters,
  footerNote,
  recordLabel,
  poloId,
  polo,
  company,
  tone = 'slate',
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<React.ElementRef<'button'>>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const [preparedPdf, setPreparedPdf] = useState<PreparedFinancialReportPdf | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreparingPdf, setIsPreparingPdf] = useState(true);
  const [progress, setProgress] = useState('');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [operation, setOperation] = useState<'download' | 'print' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const resolvedPoloId = poloId || currentSessionPoloId();
  const toneStyle = toneStyles[tone];

  const companyQuery = useQuery({
    queryKey: ['financeiro-report-company-principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
    enabled: !company,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const poloQuery = useQuery({
    queryKey: ['financeiro-report-polo', resolvedPoloId],
    queryFn: () => resolvedPoloId ? polosService.getById(resolvedPoloId) : Promise.resolve(null),
    enabled: !polo && Boolean(resolvedPoloId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: 'always',
  });

  const reportCompany = company || companyQuery.data;
  const reportPolo = polo || poloQuery.data;
  const isLoadingAssets = (!company && companyQuery.isPending)
    || (!polo && Boolean(resolvedPoloId) && poloQuery.isPending);
  const assetsError = (!company && companyQuery.error)
    || (!polo && Boolean(resolvedPoloId) && poloQuery.error);
  const isBusy = isPreparingPdf || operation !== null || isLoadingAssets;
  busyRef.current = isBusy;

  useEffect(() => {
    let active = true;
    if (isLoadingAssets) return () => { active = false; };

    if (assetsError) {
      setPreparedPdf(null);
      setIsPreparingPdf(false);
      setProgress('');
      setPdfError('Não foi possível carregar a identidade visual do relatório. Atualize a página e tente novamente.');
      return () => { active = false; };
    }

    setPreparedPdf(null);
    setPdfError(null);
    setIsPreparingPdf(true);
    setProgress('Preparando o PDF vetorial...');
    const issuedAt = new Date();
    void buildFinancialReportPdf({
      title,
      subtitle,
      rightTitle,
      rightType,
      fileName,
      columns,
      rows,
      summaryCards,
      filters,
      footerNote,
      recordLabel,
      polo: reportPolo,
      company: reportCompany,
      tone: tone as FinancialReportTone,
      issuedAt,
    }, ({ current, total }) => {
      if (active) setProgress(`Gerando página ${current} de ${total}...`);
    })
      .then((blob) => {
        assertPdfBlobReady(blob, 'O relatório financeiro');
        if (!active) return;
        setPreparedPdf({
          blob,
          fileName: getFinancialReportPdfFileName(fileName),
        });
        setProgress('PDF pronto.');
      })
      .catch((failure) => {
        if (!active) return;
        console.error('Não foi possível gerar o relatório financeiro vetorial:', failure);
        setPdfError(
          failure instanceof Error
            ? failure.message
            : 'Não foi possível preparar o PDF. Confira os dados do relatório e tente novamente.',
        );
        setProgress('');
      })
      .finally(() => {
        if (active) setIsPreparingPdf(false);
      });

    return () => { active = false; };
  }, [
    assetsError,
    attempt,
    columns,
    fileName,
    filters,
    footerNote,
    isLoadingAssets,
    recordLabel,
    reportCompany,
    reportPolo,
    rightTitle,
    rightType,
    rows,
    subtitle,
    summaryCards,
    title,
    tone,
  ]);

  useEffect(() => {
    if (!preparedPdf) {
      setPreviewUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(preparedPdf.blob);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preparedPdf]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])',
      )) as HTMLElement[];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const retry = () => {
    setAttempt((current) => current + 1);
    void Promise.all([companyQuery.refetch(), poloQuery.refetch()]);
  };

  const handleDownload = () => {
    if (!preparedPdf || operation) return;
    setOperation('download');
    setPdfError(null);
    try {
      assertPdfBlobReady(preparedPdf.blob, 'O relatório financeiro');
      downloadPdfBlob(preparedPdf.blob, preparedPdf.fileName);
      setProgress('PDF baixado.');
    } catch (failure) {
      setPdfError(failure instanceof Error ? failure.message : 'Não foi possível baixar o PDF.');
    } finally {
      setOperation(null);
    }
  };

  const handlePrint = async () => {
    if (!preparedPdf || operation) return;
    setOperation('print');
    setPdfError(null);
    try {
      assertPdfBlobReady(preparedPdf.blob, 'O relatório financeiro');
      await printPdfBlob(preparedPdf.blob, { title });
    } catch (failure) {
      setPdfError(failure instanceof Error ? failure.message : 'Não foi possível preparar a impressão do PDF.');
    } finally {
      setOperation(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-0 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="financeiro-report-preview-title"
      aria-busy={isBusy}
    >
      <div ref={dialogRef} className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl">
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneStyle.soft}`}>
              <FileText size={19} />
            </span>
            <div className="min-w-0">
              <h2 id="financeiro-report-preview-title" className="truncate text-base font-black uppercase tracking-tight text-[#001a33]">
                {title}
              </h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                {isLoadingAssets
                  ? 'Carregando identidade visual...'
                  : isPreparingPdf
                    ? progress || 'Preparando o PDF vetorial...'
                    : `${rows.length} ${recordLabel || 'registro(s)'} · prévia, download e impressão usam o mesmo PDF`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!preparedPdf || isBusy}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${toneStyle.button}`}
            >
              {operation === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Baixar PDF
            </button>
            <button
              type="button"
              onClick={() => { void handlePrint(); }}
              disabled={!preparedPdf || isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {operation === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              Imprimir PDF
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Fechar prévia do relatório"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-slate-200/70 p-3 sm:p-4">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title={`${title} em PDF`}
              className="h-full min-h-[560px] w-full border-0 bg-white shadow-xl"
            />
          ) : (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-500" role={pdfError ? 'alert' : 'status'}>
              {pdfError ? <AlertTriangle className="text-rose-600" size={32} /> : <Loader2 className={`animate-spin ${toneStyle.text}`} size={32} />}
              <h3 className="mt-3 text-sm font-black uppercase tracking-wide text-[#001a33]">
                {pdfError ? 'Prévia indisponível' : 'Preparando PDF nativo'}
              </h3>
              <p className={`mt-1 max-w-md text-sm ${pdfError ? 'text-rose-700' : 'text-slate-500'}`}>
                {pdfError || 'A prévia abrirá o mesmo relatório vetorial que poderá ser baixado ou impresso.'}
              </p>
              {pdfError ? (
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <RotateCcw size={14} /> Preparar novamente
                </button>
              ) : null}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white px-4 py-2 text-center text-[11px] font-medium text-slate-500">
          {pdfError ? (
            <span className="inline-flex items-center gap-1.5 text-rose-700"><AlertTriangle size={13} />{pdfError}</span>
          ) : (
            'Prévia, download e impressão usam o mesmo PDF vetorial.'
          )}
        </footer>
      </div>
    </div>,
    document.body,
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
  const toneStyle = toneStyles[tone];

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
        title="Abrir prévia do extrato em PDF"
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
