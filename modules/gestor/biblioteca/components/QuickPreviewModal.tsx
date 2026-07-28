// File: modules/gestor/biblioteca/components/QuickPreviewModal.tsx

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import { LibraryDocument } from '../biblioteca.types';
import FilePreviewContent from './file-preview/FilePreviewContent';
import LibraryFileIcon from './file-preview/LibraryFileIcon';
import {
  getFileTypeLabel,
  isPublicHttpUrl,
  resolvePreviewKind
} from './file-preview/filePreview.utils';

interface QuickPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: LibraryDocument | null;
}

const QuickPreviewModal: React.FC<QuickPreviewModalProps> = ({
  isOpen,
  onClose,
  document: file
}) => {
  const backButtonRef = useRef<React.ElementRef<'button'>>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [renderAllPdfPages, setRenderAllPdfPages] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const normalizedUrl = `${file?.url || ''}`.trim();
  const canDownload = isPublicHttpUrl(normalizedUrl);
  const previewKind = file
    ? resolvePreviewKind(file.fileType, file.title, normalizedUrl)
    : 'OTHER';
  const canPrint = canDownload
    && (previewKind === 'PDF' || previewKind === 'IMG')
    && !(previewKind === 'PDF' && pdfLoadFailed);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = window.document.body.style.overflow;
    const previouslyFocused = window.document.activeElement as { focus?: () => void } | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };

    window.document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => backButtonRef.current?.focus());

    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    setRenderAllPdfPages(false);
    setPdfReady(false);
    setPdfLoadFailed(false);
    setIsPreparingPrint(false);
  }, [file?.id, isOpen]);

  useEffect(() => {
    if (!isPreparingPrint || !pdfReady) return;
    const timeoutId = window.setTimeout(() => {
      window.print();
      setIsPreparingPrint(false);
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [isPreparingPrint, pdfReady]);

  if (!isOpen || !file || typeof window === 'undefined') return null;

  const handlePrint = () => {
    if (!canPrint || isPreparingPrint) return;
    if (previewKind === 'PDF' && !pdfReady) {
      setRenderAllPdfPages(true);
      setIsPreparingPrint(true);
      return;
    }
    window.print();
  };

  return createPortal(
    <div
      id="library-preview-modal"
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen animate-fadeIn flex-col overflow-hidden bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-preview-title"
    >
      <header className="z-10 flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-800 px-4 py-3 text-white shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            ref={backButtonRef}
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-700/50 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            aria-label="Fechar visualizador"
            title="Voltar (Esc)"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <LibraryFileIcon kind={previewKind} size="sm" />
          <div className="min-w-0">
            <h3
              id="library-preview-title"
              className="truncate text-sm font-black uppercase tracking-widest text-white"
              title={file.title}
            >
              Visualizador de Documentos
            </h3>
            <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">
              {file.title} • {getFileTypeLabel(previewKind)} • {file.size}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
          <a
            href={canDownload ? normalizedUrl : undefined}
            download={canDownload ? file.title : undefined}
            aria-disabled={!canDownload}
            onClick={(event) => {
              if (!canDownload) event.preventDefault();
            }}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all sm:px-5 sm:py-3 sm:text-xs ${
              canDownload
                ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                : 'cursor-not-allowed border-white/5 bg-white/5 text-slate-500'
            }`}
          >
            <Download size={16} />
            <span>Baixar</span>
          </a>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!canPrint || isPreparingPrint}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-6 sm:py-3 sm:text-xs"
            title={canPrint
              ? isPreparingPrint ? 'Preparando todas as páginas' : 'Imprimir documento'
              : 'Impressão disponível para PDF e imagens'
            }
          >
            {isPreparingPrint
              ? <Loader2 size={16} className="animate-spin" />
              : <Printer size={16} />
            }
            <span>{isPreparingPrint ? 'Preparando...' : 'Imprimir'}</span>
          </button>
        </div>
      </header>

      <main className="library-preview-content min-h-0 flex-1 overflow-auto bg-slate-900 custom-scrollbar">
        <FilePreviewContent
          file={file}
          renderAllPdfPages={renderAllPdfPages}
          onPdfReadyChange={setPdfReady}
          onPdfError={() => {
            setPdfLoadFailed(true);
            setIsPreparingPrint(false);
          }}
        />
      </main>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #library-preview-modal, #library-preview-modal * {
            visibility: visible;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #library-preview-modal {
            position: absolute;
            inset: 0;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          #library-preview-modal > header {
            display: none !important;
          }
          #library-preview-modal .library-preview-content {
            overflow: visible !important;
            background: white !important;
          }
          #library-preview-modal .pdf-preview-page {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
          }
          #library-preview-modal .library-image-preview {
            min-height: 297mm !important;
            padding: 0 !important;
            background: white !important;
          }
          #library-preview-modal canvas,
          #library-preview-modal img {
            max-width: 100% !important;
          }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
    </div>,
    window.document.body
  );
};

export default QuickPreviewModal;
