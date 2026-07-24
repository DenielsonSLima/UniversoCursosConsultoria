import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  FileCheck2,
  FilePlus2,
  Loader2,
  Printer,
  X,
} from 'lucide-react';
import { DiarioPrintDocumentProps } from '../diario-classe.types';
import { buildDiarioPdf } from '../diario-pdf';
import { DiarioExportMode } from '../turma-diarios.types';

interface DiarioExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  printProps: DiarioPrintDocumentProps;
  exportMode: DiarioExportMode;
  onDownloadPdf: () => Promise<void>;
  onPrintPdf: () => Promise<void>;
  downloadingPdf: boolean;
  printingPdf: boolean;
}

const DiarioExportModal: React.FC<DiarioExportModalProps> = ({
  isOpen,
  onClose,
  printProps,
  exportMode,
  onDownloadPdf,
  onPrintPdf,
  downloadingPdf,
  printingPdf,
}) => {
  const [pdfUrl, setPdfUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isBlank = exportMode === 'EM_BRANCO';

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let disposed = false;
    let objectUrl = '';
    setPdfUrl('');
    setPreviewError('');

    void buildDiarioPdf(printProps)
      .then((pdf) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(pdf.output('blob'));
        setPdfUrl(objectUrl);
      })
      .catch((error) => {
        if (disposed) return;
        setPreviewError(error?.message || 'Não foi possível montar a pré-visualização.');
      });

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, printProps]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diario-export-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden bg-slate-950/95 outline-none backdrop-blur-md"
    >
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-5 py-3 shadow-md">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isBlank ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300'
          }`}>
            {isBlank ? <FilePlus2 size={20} /> : <FileCheck2 size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="diario-export-title" className="truncate text-sm font-black uppercase tracking-wide text-white">
                {isBlank ? 'Diário em branco' : 'Diário preenchido'}
              </h2>
              <span className={`hidden rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider sm:inline-flex ${
                isBlank ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
              }`}>
                {isBlank ? 'Preenchimento manual' : 'Registros do sistema'}
              </span>
            </div>
            <p className="truncate text-xs font-medium text-slate-400">
              {printProps.disciplina.nome} • {printProps.moduloNome} • {printProps.turma.codigo}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={downloadingPdf || !pdfUrl}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {downloadingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            <span className="hidden sm:inline">{downloadingPdf ? 'Gerando' : 'Baixar PDF'}</span>
          </button>
          <button
            type="button"
            onClick={onPrintPdf}
            disabled={printingPdf || !pdfUrl}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {printingPdf ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            <span className="hidden sm:inline">{printingPdf ? 'Preparando' : 'Imprimir'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Fechar pré-visualização"
          >
            <X size={21} />
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-hidden bg-slate-950 p-3 sm:p-5">
        {!pdfUrl && !previewError && (
          <div className="flex flex-col items-center gap-3 text-slate-300">
            <Loader2 size={30} className="animate-spin text-blue-400" />
            <p className="text-xs font-bold">Montando o PDF vetorial...</p>
          </div>
        )}
        {previewError && (
          <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center text-sm font-bold text-rose-200">
            {previewError}
          </div>
        )}
        {pdfUrl && (
          <iframe
            title={`Pré-visualização do diário ${isBlank ? 'em branco' : 'preenchido'}`}
            src={pdfUrl}
            className="h-full w-full rounded-xl border border-slate-800 bg-white shadow-2xl"
          />
        )}
      </main>
    </div>,
    document.body,
  );
};

export default DiarioExportModal;
