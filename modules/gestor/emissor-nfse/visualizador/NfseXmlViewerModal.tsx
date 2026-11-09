import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileSearch, Loader2, Printer, X } from 'lucide-react';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { printPdfBlob } from '../../secretaria/shared/pdf-blob-print';
import { useNfseStudentsDialog } from '../preparar/useNfseStudentsDialog';
import type { NfseDocument } from '../types/nfse.types';
import { useNfseTabContext } from '../components/NfseTabContext';
import { useNfseIssuedXml } from './hooks/useNfseIssuedXml';
import { prepareIssuedDanfsePdf } from './services/nfse-issued-pdf.service';
import './nfse-xml-viewer.css';

interface PreparedDanfse { blob: Blob; filename: string; number: string }

export default function NfseXmlViewerModal({ document, onClose }: { document: NfseDocument; onClose: () => void }) {
  const titleId = useId();
  const { scope } = useNfseTabContext();
  const query = useNfseIssuedXml(scope, document);
  const issued = query.error ? undefined : query.data;
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<globalThis.HTMLButtonElement>(onClose);
  const [prepared, setPrepared] = useState<PreparedDanfse | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const printController = useRef<AbortController | null>(null);
  const canUsePdf = Boolean(prepared && !busy && !query.isFetching && !query.error);

  useEffect(() => () => printController.current?.abort(), []);
  useEffect(() => {
    if (!prepared) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(prepared.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  useEffect(() => {
    const controller = new AbortController();
    setPrepared(null);
    setError('');
    setBusy(Boolean(issued));
    if (!issued || !scope) {
      printController.current?.abort();
      setPrinting(false);
    } else {
      void (async () => {
        try {
          const blob = await prepareIssuedDanfsePdf(scope, issued, controller.signal);
          if (controller.signal.aborted) return;
          setPrepared({ blob, filename: `DANFSe-${issued.accessKey}.pdf`, number: issued.number });
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível visualizar a nota.');
        } finally { if (!controller.signal.aborted) setBusy(false); }
      })();
    }
    return () => controller.abort();
  }, [issued, scope]);

  const print = async () => {
    if (!canUsePdf || !prepared || printing) return;
    setPrinting(true);
    setError('');
    const controller = new AbortController();
    printController.current = controller;
    try { await printPdfBlob(prepared.blob, { title: `DANFSe ${prepared.number}`, signal: controller.signal }); }
    catch (cause) {
      if (!controller.signal.aborted) setError('Não foi possível abrir a impressão. Baixe o PDF e tente novamente.');
    } finally { if (!controller.signal.aborted) setPrinting(false); }
  };

  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-xml-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="nfse-xml-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="nfse-section-heading nfse-xml-heading">
        <h2 id={titleId}>NFS-e {document.number} · {document.studentName}</h2>
        <button ref={initialFocusRef} type="button" className="nfse-button nfse-button-secondary" onClick={onClose} aria-label="Fechar visualizador"><X size={17} /></button>
      </header>
      <div className="nfse-xml-toolbar">
        <span>DANFSe da nota emitida · {scope?.environment === 'HOMOLOGACAO' ? 'Homologação' : 'Produção'}</span>
        <div className="nfse-xml-actions">
          <button type="button" className="nfse-button nfse-button-secondary" disabled={!canUsePdf} onClick={() => canUsePdf && prepared && downloadPdfBlob(prepared.blob, prepared.filename)}><Download size={16} />Baixar PDF</button>
          <button type="button" className="nfse-button nfse-button-primary" disabled={!canUsePdf || printing} onClick={() => void print()}>
            {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}Imprimir
          </button>
        </div>
      </div>
      {(error || query.error) && <p className="nfse-xml-error" role="alert">{error || query.error?.message}</p>}
      <div className="nfse-xml-preview" aria-busy={busy || query.isFetching}>
        {busy || query.isFetching ? <div className="nfse-xml-empty" role="status"><Loader2 className="animate-spin" size={24} /><p>Carregando nota emitida…</p></div>
          : !query.error && prepared && previewUrl ? <iframe src={previewUrl} title={`DANFSe ${prepared.number}`} />
            : <div className="nfse-xml-empty"><FileSearch size={28} /><p>Não foi possível carregar a prévia desta nota.</p></div>}
      </div>
    </div>
  </div>, globalThis.document.body);
}
