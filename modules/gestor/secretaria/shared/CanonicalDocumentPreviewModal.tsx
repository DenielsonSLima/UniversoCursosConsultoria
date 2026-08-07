import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  ExternalLink,
  FileWarning,
  Loader2,
  Printer,
  X,
} from 'lucide-react';

import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { assertPdfBlobReady, printPdfBlob } from './pdf-blob-print';
import type {
  CanonicalDocumentPdfFactory,
  CanonicalDocumentPdfResult,
} from './canonical-document-pdf.types';
import type { CanonicalDocumentPreviewItem } from './canonical-document-render.types';

interface PreparedPdf extends CanonicalDocumentPdfResult {
  key: string;
}

interface CanonicalDocumentPreviewModalProps<Item extends CanonicalDocumentPreviewItem> {
  items: Item[];
  initialIndex?: number;
  title: string;
  accentClassName: string;
  fileNamePrefix: string;
  onClose: () => void;
  isRenderable: (item: Item) => boolean;
  /** Produz o PDF nativo oficial a partir do payload já preparado pela RPC. */
  createPdf: CanonicalDocumentPdfFactory<Item>;
}

const makeBatchKey = <Item extends CanonicalDocumentPreviewItem,>(items: Item[]) => (
  items.map((item) => item.emissionId).join(':') || 'sem-documento'
);

const CanonicalDocumentPreviewModal = <Item extends CanonicalDocumentPreviewItem,>({
  items,
  initialIndex = 0,
  title,
  accentClassName,
  fileNamePrefix,
  onClose,
  isRenderable,
  createPdf,
}: CanonicalDocumentPreviewModalProps<Item>) => {
  const preparedPdfRef = useRef<PreparedPdf | null>(null);
  const preparationRef = useRef<Promise<PreparedPdf> | null>(null);
  const createPdfRef = useRef(createPdf);
  const itemsRef = useRef(items);
  const keyRef = useRef('');
  const [previewPdf, setPreviewPdf] = useState<PreparedPdf | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreparingPreview, setIsPreparingPreview] = useState(true);
  const [operation, setOperation] = useState<'download' | 'print' | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  createPdfRef.current = createPdf;
  itemsRef.current = items;

  const documentKey = makeBatchKey(items);
  keyRef.current = documentKey;
  const currentItem = items[Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1))] || null;
  const isBatch = items.length > 1;
  const allItemsRenderable = items.length > 0 && items.every(isRenderable);
  const isBusy = operation !== null || isPreparingPreview;

  const preparePdf = async (): Promise<PreparedPdf> => {
    const key = keyRef.current;
    const currentItems = itemsRef.current;
    if (!currentItems.length) throw new Error('Nenhum documento foi selecionado para visualização.');
    if (!currentItems.every(isRenderable)) {
      throw new Error('O servidor não retornou um payload renderizável completo para todos os documentos do lote.');
    }
    if (preparedPdfRef.current?.key === key) return preparedPdfRef.current;
    if (preparationRef.current) return preparationRef.current;

    const preparation = (async () => {
      const pdf = await createPdfRef.current(currentItems, {
        onProgress: (nextProgress) => {
          if (keyRef.current === key) setProgress(nextProgress);
        },
      });
      assertPdfBlobReady(pdf.blob, isBatch ? 'O PDF do lote' : 'O PDF do documento');
      const fallbackName = `${fileNamePrefix}-${isBatch ? `lote-${currentItems.length}` : currentItems[0].emissionId}.pdf`;
      const prepared = {
        key,
        blob: pdf.blob,
        fileName: pdf.fileName || fallbackName,
      };
      if (keyRef.current === key) preparedPdfRef.current = prepared;
      return prepared;
    })();

    preparationRef.current = preparation;
    try {
      return await preparation;
    } finally {
      if (keyRef.current === key) preparationRef.current = null;
    }
  };

  useEffect(() => {
    let active = true;
    preparedPdfRef.current = null;
    preparationRef.current = null;
    setPreviewPdf(null);
    setPreviewUrl(null);
    setError(null);
    setProgress({ current: 0, total: Math.max(items.length, 1) });
    setIsPreparingPreview(true);

    void preparePdf()
      .then((pdf) => {
        if (active) setPreviewPdf(pdf);
      })
      .catch((failure) => {
        if (active) {
          setError(failure instanceof Error ? failure.message : 'Não foi possível preparar a prévia do documento.');
        }
      })
      .finally(() => {
        if (active) {
          setIsPreparingPreview(false);
          setProgress(null);
        }
      });

    return () => {
      active = false;
    };
    // A identidade do PDF é exclusivamente a lista canônica de emissões.
  }, [documentKey]);

  useEffect(() => {
    if (!previewPdf) return undefined;
    const objectUrl = URL.createObjectURL(previewPdf.blob);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [previewPdf]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isBusy, onClose]);

  const handleDownload = async () => {
    if (operation) return;
    setOperation('download');
    setError(null);
    try {
      const pdf = await preparePdf();
      downloadPdfBlob(pdf.blob, pdf.fileName);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível gerar o PDF do documento.');
    } finally {
      setOperation(null);
    }
  };

  const handlePrint = async () => {
    if (operation) return;
    setOperation('print');
    setError(null);
    try {
      const pdf = await preparePdf();
      await printPdfBlob(pdf.blob, { title: isBatch ? `${title} - lote` : title });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível preparar o documento para impressão.');
    } finally {
      setOperation(null);
    }
  };

  if (!currentItem) return null;

  return (
    <div className="fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen animate-fadeIn bg-slate-950" role="dialog" aria-modal="true" aria-label={title} aria-busy={isBusy}>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-950 shadow-2xl">
        <header className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-800 px-4 py-3 text-white shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-700/60 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div className="min-w-0">
              <h4 className="truncate text-sm font-black uppercase tracking-wide text-white">{title}</h4>
              <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-slate-400">
                {isBatch ? `${items.length} documentos · PDF consolidado` : currentItem.targetName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {previewUrl && (
              <button
                type="button"
                onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 sm:py-3 sm:text-xs"
              >
                <ExternalLink size={14} /> Abrir
              </button>
            )}
            <button type="button" onClick={() => { void handleDownload(); }} disabled={isBusy || !allItemsRenderable || !previewPdf} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 sm:py-3 sm:text-xs">
              {operation === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar PDF
            </button>
            <button type="button" onClick={() => { void handlePrint(); }} disabled={isBusy || !allItemsRenderable || !previewPdf} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 sm:py-3 sm:text-xs ${accentClassName}`}>
              {operation === 'print' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Imprimir
            </button>
            <button type="button" onClick={onClose} disabled={isBusy} aria-label="Fechar visualizador" className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"><X size={18} /></button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-900 p-3 custom-scrollbar sm:p-6 lg:p-8">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title={`${title} - PDF oficial`}
              className="h-full min-h-[620px] w-full max-w-6xl rounded-xl border border-white/15 bg-white shadow-2xl"
            />
          ) : (
            <div className="flex min-h-[420px] w-full max-w-xl flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-800/70 p-8 text-center text-white">
              {error ? <FileWarning className="text-amber-300" size={38} /> : <Loader2 className="animate-spin text-blue-300" size={38} />}
              <h5 className="mt-4 text-sm font-black uppercase tracking-wide">{error ? 'Prévia indisponível' : 'Preparando PDF nativo'}</h5>
              <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-300">
                {error || 'A prévia abrirá o mesmo arquivo vetorial que será baixado ou impresso.'}
              </p>
            </div>
          )}
        </main>

        <footer className="shrink-0 border-t border-white/10 bg-slate-800 px-4 py-2 text-center text-[10px] font-medium text-slate-300">
          {error ? (
            <span className="inline-flex items-center gap-1.5 text-rose-300"><AlertTriangle size={13} /> {error}</span>
          ) : isBusy && progress ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Preparando PDF: {progress.current} de {progress.total} documento(s)</span>
          ) : !allItemsRenderable ? (
            <span className="inline-flex items-center gap-1.5 text-amber-300"><FileWarning size={13} /> A emissão não trouxe todas as páginas canônicas necessárias.</span>
          ) : (
            <span>Esta prévia é o próprio PDF nativo: texto selecionável, QR e marca d&apos;água como ativos separados.</span>
          )}
        </footer>
      </div>
    </div>
  );
};

export default CanonicalDocumentPreviewModal;
