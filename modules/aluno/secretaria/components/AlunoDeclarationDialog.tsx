import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, FileText, Loader2, Printer, X } from 'lucide-react';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { printPdfBlob } from '../../../gestor/secretaria/shared/pdf-blob-print';
import { loadAlunoDeclarationPdf, type AlunoDeclarationPdf } from '../aluno-declaration.service';

interface AlunoDeclarationDialogProps {
  open: boolean;
  onClose: () => void;
  alunoId: string;
  enrollmentId: string;
  contextId: string;
}

type ActiveDialogProps = Omit<AlunoDeclarationDialogProps, 'open' | 'contextId'>;
type PdfState = { revision: number; result: AlunoDeclarationPdf | null; url: string; error: string | null };

const ActiveDeclarationDialog: React.FC<ActiveDialogProps> = ({ onClose, alunoId, enrollmentId }) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const activeRef = useRef(true);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<PdfState>({ revision: -1, result: null, url: '', error: null });
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const current = state.revision === revision;
  const result = current ? state.result : null;
  const error = current ? state.error : null;
  const preparing = !current;

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    void loadAlunoDeclarationPdf(enrollmentId, alunoId, controller.signal).then(pdf => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(pdf.blob);
      setState({ revision, result: pdf, url, error: null });
    }).catch(failure => {
      if (!controller.signal.aborted) setState({ revision, result: null, url: '',
        error: failure instanceof Error ? failure.message : 'Não foi possível carregar o modelo da declaração.' });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [alunoId, enrollmentId, revision]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = (): HTMLElement[] => Array.from<HTMLElement>(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), iframe, [tabindex="0"]',
    ) || []);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('[data-modal-close]')?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const handlePrint = async () => {
    if (!result || printing) return;
    setPrinting(true);
    setPrintError(null);
    try {
      await printPdfBlob(result.blob, { title: 'Declaração de matrícula' });
    } catch (failure) {
      if (activeRef.current) setPrintError(failure instanceof Error ? failure.message : 'Não foi possível abrir a impressão.');
    } finally {
      if (activeRef.current) setPrinting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] bg-slate-950/80 p-0 backdrop-blur-sm md:p-5">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="aluno-declaration-title"
        aria-busy={preparing || printing}
        className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-slate-100 shadow-2xl md:h-full md:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 bg-[#001a33] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white md:px-6 md:py-4">
          <h2 id="aluno-declaration-title" className="flex items-center gap-2 text-sm font-black uppercase sm:text-base"><FileText size={19} />Declaração de matrícula</h2>
          <button data-modal-close type="button" onClick={onClose} aria-label="Fechar declaração"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 hover:bg-white/10"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 bg-slate-200 p-2 md:p-4">
          {preparing ? (
            <div role="status" className="flex h-full flex-col items-center justify-center gap-3 rounded-xl bg-white p-6 text-center text-slate-600">
              <Loader2 size={28} className="animate-spin text-blue-600" /><p className="text-sm font-bold">Preparando sua declaração</p>
            </div>
          ) : error ? (
            <div role="alert" className="flex h-full flex-col items-center justify-center rounded-xl bg-white p-6 text-center">
              <AlertTriangle className="text-rose-600" size={28} />
              <h3 className="mt-3 text-base font-bold text-[#001a33]">Não foi possível emitir a declaração</h3>
              <p className="mt-2 max-w-lg text-sm text-slate-600">{error}</p>
              <button type="button" onClick={() => setRevision(value => value + 1)} className="mt-5 min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Tentar novamente</button>
            </div>
          ) : result ? (
            <iframe title="Prévia da declaração de matrícula" src={`${state.url}#toolbar=0&navpanes=0&view=FitH`}
              className="h-full w-full rounded-lg border border-slate-300 bg-white" />
          ) : null}
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500">{result ? `Código de validação: ${result.code}` : 'Declaração emitida pela instituição'}</p>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <button type="button" disabled={!result || printing} onClick={() => result && downloadPdfBlob(result.blob, result.fileName)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-[#001a33] disabled:opacity-40"><Download size={16} />Baixar PDF</button>
              <button type="button" disabled={!result || printing} onClick={() => void handlePrint()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-40">{printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}{printing ? 'Preparando impressão' : 'Imprimir'}</button>
            </div>
          </div>
          {printError ? <p role="alert" className="mt-2 text-sm text-rose-600">{printError}</p> : null}
        </footer>
      </section>
    </div>, document.body,
  );
};

/** Mount a new request on every opening and every authenticated context change. */
const AlunoDeclarationDialog: React.FC<AlunoDeclarationDialogProps> = ({ open, contextId, ...props }) => (
  open ? <ActiveDeclarationDialog key={`${contextId}:${props.alunoId}:${props.enrollmentId}`} {...props} /> : null
);

export default AlunoDeclarationDialog;
