import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  FileOutput,
  Loader2,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';

import { downloadPdfBlob } from '../../../../shared/pdf/download-pdf-blob';
import { assertPdfBlobReady, printPdfBlob } from '../../../secretaria/shared/pdf-blob-print';
import {
  buildEmprestimosExportPdf,
  getEmprestimosExportPdfFileName,
} from '../emprestimos-export.pdf';
import { emprestimosQueryKeys } from '../emprestimos.queryKeys';
import { emprestimosService } from '../emprestimos.service';
import type {
  EmprestimosExportSnapshot,
  EmprestimoStatusScope,
} from '../emprestimos.types';

interface EmprestimosExportModalProps {
  open: boolean;
  poloId: string;
  statusScope: EmprestimoStatusScope;
  onClose: () => void;
}

interface PreparedEmprestimosPdf {
  blob: Blob;
  fileName: string;
}

const scopeLabel = (scope: EmprestimoStatusScope) => ({
  ATIVOS: 'ativos',
  FINALIZADOS: 'finalizados',
  TODOS: 'todos',
}[scope] || 'todos');

const EmprestimosExportModal: React.FC<EmprestimosExportModalProps> = ({
  open,
  poloId,
  statusScope,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<React.ElementRef<'button'>>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [preparedPdf, setPreparedPdf] = useState<PreparedEmprestimosPdf | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [operation, setOperation] = useState<'download' | 'print' | null>(null);
  const [buildAttempt, setBuildAttempt] = useState(0);

  const snapshotQuery = useQuery({
    queryKey: emprestimosQueryKeys.export(poloId, statusScope),
    queryFn: () => emprestimosService.prepararRelatorio(poloId, statusScope),
    enabled: open && Boolean(poloId),
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: 'always',
  });
  const snapshot = snapshotQuery.data as EmprestimosExportSnapshot | undefined;
  const isLoadingData = snapshotQuery.isPending;
  const loadError = snapshotQuery.error;
  const isBusy = isLoadingData || isPreparingPdf || operation !== null;

  useEffect(() => {
    let active = true;
    if (!open || isLoadingData || loadError || !snapshot) {
      setPreparedPdf(null);
      setIsPreparingPdf(false);
      if (loadError) setPdfError(null);
      return () => { active = false; };
    }

    setPreparedPdf(null);
    setPdfError(null);
    setIsPreparingPdf(true);
    const issuedAt = new Date(snapshot.issuedAt || Date.now());
    void buildEmprestimosExportPdf({ snapshot })
      .then((blob) => {
        assertPdfBlobReady(blob, 'O relatório de empréstimos');
        if (active) {
          setPreparedPdf({
            blob,
            fileName: getEmprestimosExportPdfFileName(issuedAt),
          });
        }
      })
      .catch((failure) => {
        if (active) {
          setPdfError(
            failure instanceof Error
              ? failure.message
              : 'Não foi possível preparar o PDF de empréstimos.',
          );
        }
      })
      .finally(() => {
        if (active) setIsPreparingPdf(false);
      });

    return () => { active = false; };
  }, [buildAttempt, isLoadingData, loadError, open, snapshot]);

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
      if (event.key === 'Escape') onClose();
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
    void snapshotQuery.refetch();
  };

  const handleDownload = () => {
    if (!preparedPdf || operation) return;
    setOperation('download');
    setPdfError(null);
    try {
      assertPdfBlobReady(preparedPdf.blob, 'O relatório de empréstimos');
      downloadPdfBlob(preparedPdf.blob, preparedPdf.fileName);
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
      assertPdfBlobReady(preparedPdf.blob, 'O relatório de empréstimos');
      await printPdfBlob(preparedPdf.blob, { title: 'Relatório de empréstimos' });
    } catch (failure) {
      setPdfError(failure instanceof Error ? failure.message : 'Não foi possível preparar a impressão.');
    } finally {
      setOperation(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/70 p-0 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="emprestimos-export-modal-title" aria-busy={isBusy}>
      <div ref={dialogRef} className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl">
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><FileOutput size={19} /></span>
            <div className="min-w-0">
              <h2 id="emprestimos-export-modal-title" className="truncate text-base font-black uppercase tracking-tight text-[#001a33]">Exportar relatório em PDF</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                {isLoadingData ? 'Carregando o snapshot canônico...' : isPreparingPdf ? 'Preparando o PDF oficial...' : `${snapshot?.total || 0} contrato(s) ${scopeLabel(statusScope)}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <button type="button" onClick={handleDownload} disabled={!preparedPdf || isPreparingPdf || operation !== null} className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45">
              {operation === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Baixar PDF
            </button>
            <button type="button" onClick={() => { void handlePrint(); }} disabled={!preparedPdf || isPreparingPdf || operation !== null} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-45">
              {operation === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Imprimir PDF
            </button>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200" aria-label="Fechar exportação de empréstimos"><X size={18} /></button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-slate-200/70 p-3 sm:p-4">
          {isLoadingData ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-slate-500" role="status"><Loader2 className="animate-spin text-indigo-600" size={32} /><p className="mt-3 text-sm font-semibold">Organizando o relatório canônico de empréstimos...</p></div>
          ) : loadError ? (
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center" role="alert"><AlertTriangle className="mx-auto text-rose-600" size={30} /><h3 className="mt-3 font-bold text-rose-900">Não foi possível montar a exportação</h3><p className="mt-1 text-sm text-rose-700">Verifique a conexão e tente novamente.</p><button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-800 transition-colors hover:bg-rose-100"><RotateCcw size={14} />Tentar novamente</button></div>
          ) : previewUrl ? (
            <iframe src={previewUrl} title="Relatório de empréstimos em PDF" className="h-full min-h-[560px] w-full border-0 bg-white shadow-xl" />
          ) : (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-500" role={pdfError ? 'alert' : 'status'}>
              {pdfError ? <AlertTriangle className="text-rose-600" size={32} /> : <Loader2 className="animate-spin text-indigo-600" size={32} />}
              <h3 className="mt-3 text-sm font-black uppercase tracking-wide text-[#001a33]">{pdfError ? 'Prévia indisponível' : 'Preparando PDF nativo'}</h3>
              <p className={`mt-1 max-w-md text-sm ${pdfError ? 'text-rose-700' : 'text-slate-500'}`}>{pdfError || 'A prévia abrirá o mesmo relatório vetorial que poderá ser baixado ou impresso.'}</p>
              {pdfError ? <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 transition-colors hover:bg-slate-50"><RotateCcw size={14} />Preparar novamente</button> : null}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white px-4 py-2 text-center text-[11px] font-medium text-slate-500">
          {pdfError ? <span className="inline-flex items-center gap-1.5 text-rose-700"><AlertTriangle size={13} />{pdfError}</span> : 'Prévia, download e impressão usam o mesmo PDF vetorial.'}
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default EmprestimosExportModal;
