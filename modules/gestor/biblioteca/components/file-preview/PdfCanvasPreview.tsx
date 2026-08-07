import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist';

type PdfJsModule = typeof import('pdfjs-dist');

let pdfJsPromise: Promise<PdfJsModule> | null = null;

const loadPdfJs = () => {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }

  return pdfJsPromise;
};

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  thumbnail?: boolean;
  renderImmediately?: boolean;
  onSettled?: (pageNumber: number) => void;
  onPageError?: () => void;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdf,
  pageNumber,
  thumbnail = false,
  renderImmediately = false,
  onSettled,
  onPageError,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<React.ElementRef<'canvas'>>(null);
  const [isVisible, setIsVisible] = useState(thumbnail);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (
      thumbnail ||
      renderImmediately ||
      !wrapperRef.current ||
      typeof window.IntersectionObserver === 'undefined'
    ) {
      setIsVisible(true);
      return;
    }

    const observer = new window.IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '500px 0px' }
    );
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [renderImmediately, thumbnail]);

  useEffect(() => {
    if (!isVisible) return;

    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    let cancelled = false;

    const renderPage = async () => {
      try {
        page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current || !wrapperRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(wrapperRef.current.clientWidth, thumbnail ? 180 : 320);
        const availableHeight = wrapperRef.current.clientHeight;
        const cssScale = thumbnail
          ? Math.min(
              availableWidth / baseViewport.width,
              Math.max(availableHeight, 120) / baseViewport.height
            )
          : availableWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: cssScale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, thumbnail ? 1.5 : 2);
        const canvas = canvasRef.current;

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = page.render({
          canvas,
          viewport,
          transform: pixelRatio === 1
            ? undefined
            : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: '#ffffff',
        });
        await renderTask.promise;
        if (!cancelled) onSettled?.(pageNumber);
      } catch (error) {
        if (!cancelled && (error as Error)?.name !== 'RenderingCancelledException') {
          setFailed(true);
          onPageError?.();
          onSettled?.(pageNumber);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [isVisible, onPageError, onSettled, pageNumber, pdf, thumbnail]);

  return (
    <div
      ref={wrapperRef}
      className={thumbnail
        ? 'relative flex h-full w-full items-start justify-center overflow-hidden bg-white'
        : 'pdf-preview-page relative mx-auto flex min-h-[420px] w-[210mm] max-w-full items-start justify-center overflow-hidden bg-white shadow-2xl'
      }
      aria-label={`Página ${pageNumber}`}
    >
      {!isVisible && (
        <div className="flex min-h-[420px] w-full items-center justify-center bg-slate-100">
          <Loader2 size={20} className="animate-spin text-blue-500" />
        </div>
      )}
      {failed ? (
        <div className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 bg-slate-50 p-4 text-center text-slate-400">
          <AlertCircle size={thumbnail ? 18 : 28} />
          {!thumbnail && (
            <span className="text-[10px] font-black uppercase tracking-wider">
              Não foi possível renderizar esta página
            </span>
          )}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className={thumbnail ? 'block max-w-none bg-white' : 'block max-w-full bg-white'}
        />
      )}
    </div>
  );
};

interface PdfCanvasPreviewProps {
  url: string;
  mode?: 'document' | 'thumbnail';
  title: string;
  onError?: () => void;
  onReadyChange?: (ready: boolean) => void;
  renderAllPages?: boolean;
}

const PdfCanvasPreview: React.FC<PdfCanvasPreviewProps> = ({
  url,
  mode = 'document',
  title,
  onError,
  onReadyChange,
  renderAllPages = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [shouldLoad, setShouldLoad] = useState(mode === 'document');
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [settledPages, setSettledPages] = useState<Set<number>>(() => new Set());
  const onErrorRef = useRef(onError);
  const onReadyChangeRef = useRef(onReadyChange);
  onErrorRef.current = onError;
  onReadyChangeRef.current = onReadyChange;

  useEffect(() => {
    if (mode === 'document' || !rootRef.current || typeof window.IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!shouldLoad) return;

    let cancelled = false;

    const load = async () => {
      try {
        setSettledPages(new Set());
        onReadyChangeRef.current?.(false);
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const loadingTask = pdfjs.getDocument({ url });
        loadingTaskRef.current = loadingTask;
        const loadedPdf = await loadingTask.promise;
        if (cancelled) {
          await loadedPdf.destroy();
          return;
        }
        setPdf(loadedPdf);
      } catch {
        if (!cancelled) {
          setFailed(true);
          onErrorRef.current?.();
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (loadingTask) void loadingTask.destroy();
      setPdf(null);
    };
  }, [shouldLoad, url]);

  const isThumbnail = mode === 'thumbnail';
  const pageNumbers = pdf
    ? Array.from(
        { length: isThumbnail ? Math.min(pdf.numPages, 1) : pdf.numPages },
        (_, index) => index + 1
      )
    : [];
  const handlePageSettled = React.useCallback((pageNumber: number) => {
    setSettledPages((current) => {
      if (current.has(pageNumber)) return current;
      const next = new Set(current);
      next.add(pageNumber);
      return next;
    });
  }, []);
  const handlePageError = React.useCallback(() => {
    setFailed(true);
    onErrorRef.current?.();
  }, []);

  useEffect(() => {
    if (isThumbnail || !pdf) return;
    onReadyChangeRef.current?.(settledPages.size === pdf.numPages);
  }, [isThumbnail, pdf, settledPages.size]);

  return (
    <div
      ref={rootRef}
      className={isThumbnail
        ? 'relative h-full w-full overflow-hidden bg-white'
        : 'flex min-h-full w-full flex-col items-center gap-6 bg-slate-900 p-3 sm:p-6'
      }
      aria-label={`Pré-visualização de ${title}`}
    >
      {!pdf && !failed && shouldLoad && (
        <div className={isThumbnail
          ? 'absolute inset-0 flex items-center justify-center bg-slate-100'
          : 'flex min-h-[70vh] w-[210mm] max-w-full flex-col items-center justify-center gap-3 bg-white text-slate-400'
        }>
          <Loader2 size={isThumbnail ? 18 : 32} className="animate-spin text-blue-600" />
          {!isThumbnail && (
            <span className="text-[10px] font-black uppercase tracking-widest">
              Carregando documento...
            </span>
          )}
        </div>
      )}

      {pageNumbers.map((pageNumber) => (
        <PdfPageCanvas
          key={pageNumber}
          pdf={pdf!}
          pageNumber={pageNumber}
          thumbnail={isThumbnail}
          renderImmediately={!isThumbnail && renderAllPages}
          onSettled={isThumbnail ? undefined : handlePageSettled}
          onPageError={isThumbnail ? handlePageError : undefined}
        />
      ))}
    </div>
  );
};

export default PdfCanvasPreview;
