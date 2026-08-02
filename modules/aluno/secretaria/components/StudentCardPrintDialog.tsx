import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, Printer, Scissors, X } from 'lucide-react';

interface StudentCardPrintDialogProps {
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  open: boolean;
  pdfBlob: Blob | null;
  preparing: boolean;
}

const StudentCardPrintDialog: React.FC<StudentCardPrintDialogProps> = ({
  error,
  onClose,
  onRetry,
  open,
  pdfBlob,
  preparing,
}) => {
  const iframeRef = useRef<React.ElementRef<'iframe'>>(null);
  const dialogRef = useRef<React.ElementRef<'section'>>(null);
  const previousFocusRef = useRef<{ focus?: () => void } | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfBlob) {
      setPdfUrl('');
      setPreviewReady(false);
      return undefined;
    }

    const nextUrl = URL.createObjectURL(pdfBlob);
    setPdfUrl(nextUrl);
    setPreviewReady(false);
    return () => URL.revokeObjectURL(nextUrl);
  }, [pdfBlob]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement as unknown as { focus?: () => void };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        (last as unknown as { focus: () => void }).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        (first as unknown as { focus: () => void }).focus();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector('[data-modal-close]')?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;

  const handlePrint = () => {
    setPrintError(null);
    const printWindow = iframeRef.current?.contentWindow;
    if (!printWindow || !previewReady) {
      setPrintError('A prévia A4 ainda não terminou de carregar.');
      return;
    }

    try {
      // O PDF já está pronto e carregado. A chamada acontece diretamente no
      // clique do usuário para o Safari não exibir o alerta intermediário de
      // impressão automática da página.
      printWindow.focus();
      printWindow.print();
    } catch (printFailure) {
      console.error('[SecretariaAluno] Falha ao abrir impressão da carteirinha:', printFailure);
      setPrintError('Não foi possível abrir a impressão. Tente novamente.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/80 p-0 backdrop-blur-sm md:p-6" role="presentation">
      <section
        ref={dialogRef}
        aria-labelledby="student-card-print-title"
        aria-modal="true"
        className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden border border-white/10 bg-slate-100 shadow-2xl md:h-[min(92vh,920px)] md:rounded-[1.75rem]"
        role="dialog"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 bg-[#001a33] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white md:px-7 md:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300">
              <Printer size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-300">Prévia de impressão</p>
              <h2 id="student-card-print-title" className="truncate text-base font-black uppercase tracking-tight sm:text-lg">Carteirinha em folha A4</h2>
            </div>
          </div>
          <button data-modal-close type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white md:h-10 md:w-10" aria-label="Fechar prévia de impressão">
            <X size={19} />
          </button>
        </header>

        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2.5 md:grid md:grid-cols-3 md:px-7 md:py-3">
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-600 md:bg-transparent md:p-0 md:text-[10px]"><FileText size={14} className="text-blue-600" /> Uma única folha A4</div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-600 md:bg-transparent md:p-0 md:text-[10px]"><Scissors size={14} className="text-blue-600" /> Frente e verso lado a lado</div>
          <div className="shrink-0 rounded-lg bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-600 md:bg-transparent md:p-0 md:text-right md:text-[10px]">Tamanho real: 85,6 × 54 mm</div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-200 p-3 sm:p-5">
          {preparing ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-center shadow-inner">
              <Loader2 size={30} className="animate-spin text-blue-600" />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#001a33]">Preparando a folha A4</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Montando frente, verso e marcas de recorte.</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white px-6 text-center shadow-inner">
              <p className="text-xs font-black uppercase tracking-wider text-rose-600">Não foi possível preparar a impressão</p>
              <p className="mt-2 max-w-lg text-xs font-medium leading-relaxed text-slate-500">{error}</p>
              <button type="button" onClick={onRetry} className="mt-5 rounded-xl bg-[#001a33] px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-900">Tentar novamente</button>
            </div>
          ) : pdfUrl ? (
            <iframe
              ref={iframeRef}
              className="h-full w-full rounded-2xl border border-slate-300 bg-white shadow-xl"
              onLoad={() => setPreviewReady(true)}
              src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
              title="Prévia A4 da carteirinha"
            />
          ) : null}
        </div>

        <footer className="relative flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:flex-row md:items-center md:justify-between md:px-7 md:py-4">
          <p className="max-w-2xl text-[10px] font-semibold leading-relaxed text-slate-500">
            Imprima em A4, escala 100% ou tamanho real. O sistema já posicionou as duas faces juntas e centralizadas para recorte.
          </p>
          <div className="grid shrink-0 grid-cols-[auto_1fr] gap-2 md:flex">
            <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 md:min-h-0">Cancelar</button>
            <button type="button" onClick={handlePrint} disabled={preparing || Boolean(error) || !previewReady} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none md:min-h-0">
              <Printer size={14} /> Abrir impressão
            </button>
          </div>
          {printError ? <p className="text-[10px] font-bold text-rose-600 sm:absolute sm:bottom-1 sm:right-7">{printError}</p> : null}
        </footer>
      </section>
    </div>,
    document.body,
  );
};

export default StudentCardPrintDialog;
