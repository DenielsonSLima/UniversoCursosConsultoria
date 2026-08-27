import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileCheck2,
  Loader2,
  Printer,
  X,
} from 'lucide-react';
import { downloadPdfBlob } from '../../../../shared/pdf/download-pdf-blob';
import { printPdfBlob } from '../../shared/pdf-blob-print';
import type { PreparedBaneseDocument } from '../carnes-alunos.types';

interface CarnesDocumentPreviewModalProps {
  document: PreparedBaneseDocument;
  onClose: () => void;
}

const CarnesDocumentPreviewModal = ({
  document: preparedDocument,
  onClose,
}: CarnesDocumentPreviewModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  busyRef.current = printing;
  closeRef.current = onClose;

  useEffect(() => {
    const objectUrl = URL.createObjectURL(preparedDocument.blob);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preparedDocument.blob]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      ) || [])];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
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
    window.addEventListener('keydown', onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);

  const handlePrint = async () => {
    if (printing) return;
    setPrinting(true);
    setError(null);
    try {
      await printPdfBlob(preparedDocument.blob, { title: 'Carnês dos alunos' });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível imprimir o PDF.');
    } finally {
      setPrinting(false);
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Prévia dos documentos Banese"
      aria-busy={printing}
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950 outline-none"
    >
      <header className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-800 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            data-initial-focus
            disabled={printing}
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-700/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-200 transition hover:bg-slate-700 hover:text-white disabled:opacity-40"
          >
            <ArrowLeft size={15} /> Voltar
          </button>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black uppercase tracking-wide">Carnês dos alunos</h3>
            <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-slate-400">
              {preparedDocument.groups.length} matrícula(s) · {preparedDocument.requestCount} documento(s) consultado(s)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previewUrl ? (
            <button
              type="button"
              disabled={printing}
              onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition hover:bg-white/20 disabled:opacity-40"
            >
              <ExternalLink size={14} /> Abrir
            </button>
          ) : null}
          <button
            type="button"
            disabled={printing}
            onClick={() => downloadPdfBlob(preparedDocument.blob, preparedDocument.fileName)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition hover:bg-white/20 disabled:opacity-40"
          >
            <Download size={14} /> Baixar PDF
          </button>
          <button
            type="button"
            disabled={printing}
            onClick={() => { void handlePrint(); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {printing ? <Loader2 className="animate-spin" size={14} /> : <Printer size={14} />}
            {printing ? 'Imprimindo' : 'Imprimir'}
          </button>
          <button
            type="button"
            disabled={printing}
            onClick={onClose}
            aria-label="Fechar prévia"
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-900 p-0 sm:p-3 lg:p-6">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title="PDF Banese preparado"
            className="h-full min-h-[620px] w-full border-0 bg-white shadow-2xl sm:rounded-xl sm:border sm:border-white/15"
          />
        ) : (
          <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-slate-300" role="status">
            <Loader2 className="animate-spin text-emerald-300" size={32} />
            <p className="text-xs font-black uppercase tracking-wider">Abrindo o PDF Banese...</p>
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-white/10 bg-slate-800 px-4 py-2 text-center text-[10px] font-semibold text-slate-300">
        {error ? (
          <span role="alert" aria-live="assertive" className="text-rose-300">{error}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5"><FileCheck2 size={13} /> Prévia, download e impressão usam o mesmo Blob PDF vetorial.</span>
        )}
      </footer>
    </div>,
    document.body,
  );
};

export default CarnesDocumentPreviewModal;
