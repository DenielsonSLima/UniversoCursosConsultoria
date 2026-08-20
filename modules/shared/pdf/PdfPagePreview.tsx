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

interface PdfPagePreviewProps {
  blob: Blob;
  pageNumber: number;
  title: string;
  overlay?: React.ReactNode;
}

/** Renderiza uma página do próprio Blob PDF; não replica o documento em HTML. */
const PdfPagePreview: React.FC<PdfPagePreviewProps> = ({ blob, pageNumber, title, overlay }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<React.ElementRef<'canvas'>>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    if (!wrapperRef.current) return undefined;
    const updateWidth = () => setAvailableWidth(wrapperRef.current?.clientWidth || 0);
    updateWidth();
    if (typeof window.ResizeObserver === 'undefined') return undefined;
    const observer = new window.ResizeObserver(updateWidth);
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setRendering(true);
    setPdf(null);

    void loadPdfJs()
      .then(async (pdfjs) => {
        if (cancelled) return;
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        const loadingTask = pdfjs.getDocument({ data });
        loadingTaskRef.current = loadingTask;
        const loaded = await loadingTask.promise;
        if (cancelled) {
          await loaded.destroy();
          return;
        }
        setPdf(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setRendering(false);
        }
      });

    return () => {
      cancelled = true;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [blob]);

  useEffect(() => {
    if (!pdf || !availableWidth || !canvasRef.current) return undefined;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    let cancelled = false;
    setRendering(true);
    setFailed(false);

    void pdf.getPage(pageNumber)
      .then((loadedPage) => {
        page = loadedPage;
        if (cancelled || !canvasRef.current) return null;
        const baseViewport = loadedPage.getViewport({ scale: 1 });
        const cssScale = Math.max(0.25, availableWidth / baseViewport.width);
        const viewport = loadedPage.getViewport({ scale: cssScale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = loadedPage.render({
          canvas,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: '#ffffff',
        });
        return renderTask.promise;
      })
      .then(() => {
        if (!cancelled) setRendering(false);
      })
      .catch((error) => {
        if (!cancelled && (error as Error)?.name !== 'RenderingCancelledException') {
          setFailed(true);
          setRendering(false);
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [availableWidth, pageNumber, pdf]);

  return (
    <div
      ref={wrapperRef}
      className="relative mx-auto aspect-[210/297] w-full max-w-[760px] overflow-hidden bg-white shadow-2xl"
      aria-label={`Prévia real de ${title}, página ${pageNumber}`}
      aria-busy={rendering}
    >
      <canvas ref={canvasRef} className="block max-w-full bg-white" />
      {!failed && overlay && (
        <div className="absolute inset-0 z-10" aria-label="Camada de posicionamento sobre o PDF">
          {overlay}
        </div>
      )}
      {rendering && !failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/90 text-slate-400" role="status">
          <Loader2 size={28} className="animate-spin text-blue-600" />
          <span className="text-[10px] font-black uppercase tracking-[0.18em]">Gerando página {pageNumber}</span>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-slate-500" role="alert">
          <AlertCircle size={30} className="text-rose-500" />
          <span className="text-xs font-black uppercase tracking-wider">Não foi possível renderizar esta página</span>
        </div>
      )}
    </div>
  );
};

export default PdfPagePreview;
