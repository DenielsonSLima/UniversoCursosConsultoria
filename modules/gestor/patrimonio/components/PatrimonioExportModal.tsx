import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  FileOutput,
  Loader2,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react';

import { empresasService } from '../../configuracoes/empresas/empresas.service';
import { marcaDaguaService } from '../../configuracoes/marca-dagua/marca-dagua.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { assertPdfBlobReady, printPdfBlob } from '../../secretaria/shared/pdf-blob-print';
import {
  buildPatrimonioExportPdf,
  getPatrimonioExportPdfFileName,
} from '../patrimonio-export.pdf';
import { formatPatrimonioQuantity } from '../patrimonio.formatters';
import { patrimonioQueryKeys } from '../patrimonio.queryKeys';
import { patrimonioService } from '../patrimonio.service';

interface PatrimonioExportModalProps {
  open: boolean;
  poloId: string;
  onClose: () => void;
}

interface PreparedPatrimonioPdf {
  blob: Blob;
  fileName: string;
}

export const PatrimonioExportModal: React.FC<PatrimonioExportModalProps> = ({
  open,
  poloId,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<React.ElementRef<'button'>>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [preparedPdf, setPreparedPdf] = useState<PreparedPatrimonioPdf | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [operation, setOperation] = useState<'download' | 'print' | null>(null);
  const [buildAttempt, setBuildAttempt] = useState(0);

  const patrimonioQuery = useQuery({
    queryKey: patrimonioQueryKeys.export(poloId),
    queryFn: () => patrimonioService.listAllForExport(poloId),
    enabled: open,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: 'always',
  });
  const companyQuery = useQuery({
    queryKey: ['patrimonio', 'export', 'company-principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
    enabled: open,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const poloQuery = useQuery({
    queryKey: ['patrimonio', 'export', 'polo', poloId],
    queryFn: () => polosService.getById(poloId),
    enabled: open,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const watermarksQuery = useQuery({
    queryKey: ['companies_watermarks'],
    queryFn: () => marcaDaguaService.getCompaniesWithWatermark(),
    enabled: open,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const isLoadingData = patrimonioQuery.isPending
    || companyQuery.isPending
    || poloQuery.isPending
    || watermarksQuery.isPending;
  const loadError = patrimonioQuery.error || companyQuery.error || poloQuery.error;
  const reportItems = patrimonioQuery.data || [];
  const selectedWatermark = watermarksQuery.data?.find((watermark) => watermark.id === poloId);
  const reportPolo = useMemo(() => ({
    ...(poloQuery.data || {}),
    // A exportação em A4 horizontal usa somente a arte configurada para
    // paisagem; nunca promove a marca vertical para esse relatório.
    landscapeWatermarkUrl: selectedWatermark?.landscapeWatermarkUrl,
    landscapeWatermarkOpacity: selectedWatermark?.landscapeWatermarkOpacity,
    landscapeWatermarkScale: selectedWatermark?.landscapeWatermarkScale,
    landscapeWatermarkRotate: selectedWatermark?.landscapeWatermarkRotate,
  }), [poloQuery.data, selectedWatermark]);
  const isBusy = isLoadingData || isPreparingPdf || operation !== null;

  useEffect(() => {
    let active = true;

    if (!open || isLoadingData || loadError) {
      setPreparedPdf(null);
      setIsPreparingPdf(false);
      if (loadError) setPdfError(null);
      return () => {
        active = false;
      };
    }

    setPreparedPdf(null);
    setPdfError(null);
    setIsPreparingPdf(true);
    const issuedAt = new Date();

    void buildPatrimonioExportPdf({
      items: reportItems,
      company: companyQuery.data,
      polo: reportPolo,
      issuedAt,
    })
      .then((blob) => {
        assertPdfBlobReady(blob, 'O relatório de patrimônio');
        if (active) {
          setPreparedPdf({
            blob,
            fileName: getPatrimonioExportPdfFileName(issuedAt),
          });
        }
      })
      .catch((failure) => {
        if (active) {
          setPdfError(
            failure instanceof Error
              ? failure.message
              : 'Não foi possível preparar o PDF do patrimônio.',
          );
        }
      })
      .finally(() => {
        if (active) setIsPreparingPdf(false);
      });

    return () => {
      active = false;
    };
  }, [
    buildAttempt,
    companyQuery.data,
    isLoadingData,
    loadError,
    open,
    reportItems,
    reportPolo,
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
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], iframe, input:not([disabled]), select:not([disabled]), '
        + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  const retry = () => {
    setBuildAttempt((current) => current + 1);
    void Promise.all([
      patrimonioQuery.refetch(),
      companyQuery.refetch(),
      poloQuery.refetch(),
      watermarksQuery.refetch(),
    ]);
  };

  const handleDownload = () => {
    if (!preparedPdf || operation) return;
    setOperation('download');
    setPdfError(null);
    try {
      assertPdfBlobReady(preparedPdf.blob, 'O relatório de patrimônio');
      downloadPdfBlob(preparedPdf.blob, preparedPdf.fileName);
    } catch (failure) {
      setPdfError(
        failure instanceof Error ? failure.message : 'Não foi possível baixar o PDF do patrimônio.',
      );
    } finally {
      setOperation(null);
    }
  };

  const handlePrint = async () => {
    if (!preparedPdf || operation) return;
    setOperation('print');
    setPdfError(null);
    try {
      assertPdfBlobReady(preparedPdf.blob, 'O relatório de patrimônio');
      await printPdfBlob(preparedPdf.blob, {
        title: 'Relatório completo do patrimônio',
      });
    } catch (failure) {
      setPdfError(
        failure instanceof Error ? failure.message : 'Não foi possível preparar a impressão do patrimônio.',
      );
    } finally {
      setOperation(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-0 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patrimonio-export-modal-title"
      aria-busy={isBusy}
    >
      <div
        ref={dialogRef}
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl"
      >
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileOutput size={19} /></span>
            <div className="min-w-0">
              <h2 id="patrimonio-export-modal-title" className="truncate text-base font-black uppercase tracking-tight text-[#001a33]">Exportar patrimônio</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                {isLoadingData
                  ? 'Carregando todos os registros do polo...'
                  : isPreparingPdf
                    ? 'Preparando o PDF oficial...'
                    : `${formatPatrimonioQuantity(reportItems.length)} patrimônio(s) listado(s)`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!preparedPdf || isPreparingPdf || operation !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {operation === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Baixar PDF
            </button>
            <button
              type="button"
              onClick={() => { void handlePrint(); }}
              disabled={!preparedPdf || isPreparingPdf || operation !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {operation === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              Imprimir
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
              aria-label="Fechar exportação de patrimônio"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-slate-200/70 p-3 sm:p-4">
          {isLoadingData ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-slate-500" role="status">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="mt-3 text-sm font-semibold">Organizando a relação completa de patrimônios...</p>
            </div>
          ) : loadError ? (
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center" role="alert">
              <AlertTriangle className="mx-auto text-rose-600" size={30} />
              <h3 className="mt-3 font-bold text-rose-900">Não foi possível montar a exportação</h3>
              <p className="mt-1 text-sm text-rose-700">Verifique a conexão e tente carregar novamente os dados institucionais e patrimoniais.</p>
              <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-800 transition-colors hover:bg-rose-100">
                <RefreshCw size={14} />Tentar novamente
              </button>
            </div>
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              title="Relatório completo do patrimônio em PDF"
              className="h-full min-h-[560px] w-full border-0 bg-white shadow-xl"
            />
          ) : (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-500" role={pdfError ? 'alert' : 'status'}>
              {pdfError ? <AlertTriangle className="text-rose-600" size={32} /> : <Loader2 className="animate-spin text-blue-600" size={32} />}
              <h3 className="mt-3 text-sm font-black uppercase tracking-wide text-[#001a33]">
                {pdfError ? 'Prévia indisponível' : 'Preparando PDF nativo'}
              </h3>
              <p className={`mt-1 max-w-md text-sm ${pdfError ? 'text-rose-700' : 'text-slate-500'}`}>
                {pdfError || 'A prévia abrirá o mesmo relatório vetorial que poderá ser baixado ou impresso.'}
              </p>
              {pdfError ? (
                <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 transition-colors hover:bg-slate-50">
                  <RefreshCw size={14} />Preparar novamente
                </button>
              ) : null}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white px-4 py-2 text-center text-[11px] font-medium text-slate-500">
          {pdfError ? (
            <span className="inline-flex items-center gap-1.5 text-rose-700"><AlertTriangle size={13} />{pdfError}</span>
          ) : (
            'Prévia, download e impressão usam o mesmo PDF nativo em paisagem.'
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
};
