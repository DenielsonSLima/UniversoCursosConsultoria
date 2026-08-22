import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { formatCaixaCompetencia } from '../caixa.formatters';
import {
  buildCaixaReportFileName,
  buildCaixaReportPdf,
  getCaixaReportPdfErrorMessage,
} from './caixa-report.pdf';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { caixaReportQueryOptions } from './caixa-report.service';
import type { CaixaDetailedReport } from './caixa-report.types';

interface CaixaReportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  poloId: string | null | undefined;
  competencia: string;
}

interface PreparedCaixaReportPdf {
  blob: Blob;
  fileName: string;
}

export const CaixaReportPreviewModal: React.FC<CaixaReportPreviewModalProps> = ({
  open,
  onClose,
  poloId,
  competencia,
}) => {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<React.ElementRef<'button'>>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const generatingRef = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [reportSnapshot, setReportSnapshot] = useState<CaixaDetailedReport | null>(null);
  const [preparedPdf, setPreparedPdf] = useState<PreparedCaixaReportPdf | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const reportQuery = useQuery(caixaReportQueryOptions(
    poloId,
    competencia,
    open && !reportSnapshot,
  ));

  useEffect(() => {
    if (!open) {
      setReportSnapshot(null);
      queryClient.removeQueries({
        queryKey: ['caixa-report', 'monthly'],
      });
      return;
    }
    if (reportQuery.data && !reportQuery.isFetching && !reportQuery.error) {
      setReportSnapshot((current) => current ?? reportQuery.data);
    }
  }, [
    open,
    queryClient,
    reportQuery.data,
    reportQuery.error,
    reportQuery.isFetching,
  ]);

  useEffect(() => {
    setReportSnapshot(null);
  }, [competencia, poloId]);

  useEffect(() => {
    let active = true;
    if (!open || !reportSnapshot) {
      setPreparedPdf(null);
      setGenerating(false);
      return () => { active = false; };
    }

    setPreparedPdf(null);
    setGenerationError('');
    setGenerating(true);
    setProgress('Preparando o PDF oficial...');

    void buildCaixaReportPdf(
      reportSnapshot,
      (current, total) => {
        if (active) setProgress(`Gerando página ${current} de ${total}...`);
      },
    )
      .then((blob) => {
        if (!active) return;
        setPreparedPdf({
          blob,
          fileName: buildCaixaReportFileName(
            reportSnapshot.resumo.meta.competencia,
            reportSnapshot.resumo.meta.escopoRotulo,
          ),
        });
        setProgress('PDF pronto.');
      })
      .catch((failure) => {
        if (!active) return;
        console.error('Não foi possível preparar o PDF do Caixa:', failure);
        setGenerationError(getCaixaReportPdfErrorMessage(failure));
        setProgress('');
      })
      .finally(() => {
        if (active) setGenerating(false);
      });

    return () => { active = false; };
  }, [open, reportSnapshot]);

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
    generatingRef.current = generating;
  }, [generating]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !generatingRef.current) {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), '
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

  useEffect(() => {
    if (open) return;
    setGenerating(false);
    setProgress('');
    setGenerationError('');
  }, [open]);

  if (!open) return null;

  const report = reportSnapshot;
  const loading = !reportSnapshot && (reportQuery.isLoading || reportQuery.isFetching);
  const error = reportSnapshot ? null : reportQuery.error;

  const handleDownload = () => {
    if (!preparedPdf || loading || error || generating) return;
    setGenerationError('');
    try {
      downloadPdfBlob(preparedPdf.blob, preparedPdf.fileName);
      setProgress('PDF baixado.');
    } catch (downloadError) {
      console.error('Não foi possível baixar o PDF do Caixa:', downloadError);
      setGenerationError(getCaixaReportPdfErrorMessage(downloadError));
      setProgress('');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="caixa-report-modal-title"
      aria-busy={loading || generating}
    >
      <div
        ref={dialogRef}
        className="flex h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl"
      >
        <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <FileText size={20} />
            </span>
            <div className="min-w-0">
              <h2
                id="caixa-report-modal-title"
                className="truncate text-base font-black uppercase tracking-tight text-[#001a33]"
              >
                Pré-visualização da prestação de contas
              </h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                {formatCaixaCompetencia(competencia)}
                {report ? ` · ${report.resumo.meta.escopoRotulo}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-[145px] text-right text-[11px] font-semibold text-slate-500" aria-live="polite">
              {progress}
            </span>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!preparedPdf || loading || Boolean(error) || generating}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-blue-950 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {generating ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              Baixar PDF
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              disabled={generating}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Fechar pré-visualização"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-slate-200/70 p-3 sm:p-4">
          {loading && (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-slate-500" role="status">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="mt-3 text-sm font-semibold">
                Montando detalhes e conferindo os totais...
              </p>
            </div>
          )}

          {error && (
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center" role="alert">
              <AlertTriangle className="mx-auto text-rose-600" size={30} />
              <h3 className="mt-3 font-bold text-rose-900">Não foi possível montar o relatório</h3>
              <p className="mt-1 text-sm text-rose-700">
                Não foi possível gerar um relatório completo ou houve uma falha de conexão.
              </p>
              <button
                type="button"
                onClick={() => {
                  setReportSnapshot(null);
                  void reportQuery.refetch();
                }}
                className="mt-4 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-800"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && generationError && !previewUrl && (
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center" role="alert">
              <AlertTriangle className="mx-auto text-rose-600" size={30} />
              <h3 className="mt-3 font-bold text-rose-900">Prévia indisponível</h3>
              <p className="mt-1 text-sm text-rose-700">{generationError}</p>
            </div>
          )}

          {!loading && !error && report && !generationError && previewUrl && (
            <iframe
              src={previewUrl}
              title="Prestação de contas mensal em PDF"
              className="h-full min-h-[560px] w-full border-0 bg-white shadow-xl"
            />
          )}

          {!loading && !error && report && !generationError && !previewUrl && (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-slate-500" role="status">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="mt-3 text-sm font-semibold">Preparando o PDF vetorial...</p>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white px-4 py-2 text-center text-[11px] font-medium text-slate-500">
          Prévia e download usam exatamente o mesmo PDF vetorial.
        </footer>
      </div>
    </div>,
    document.body,
  );
};
