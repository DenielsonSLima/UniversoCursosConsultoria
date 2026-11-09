import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileUp, Loader2, Printer, X } from 'lucide-react';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { printPdfBlob } from '../../secretaria/shared/pdf-blob-print';
import { useNfseStudentsDialog } from '../preparar/useNfseStudentsDialog';
import { loadDanfseAssets } from './danfse.assets';
import { createDanfsePdf } from './danfse.pdf';
import { DANFSE_XML_MAX_BYTES } from './danfse.types';
import { parseDanfseXml } from './danfse.xml';
import { useNfseTabContext } from '../components/NfseTabContext';
import { danfseComponents, needsDanfseProjection } from './danfse.projection';
import { useDanfseProjection } from './hooks/useDanfseProjection';
import './nfse-xml-viewer.css';

interface PreparedDanfse { blob: Blob; filename: string; number: string }

export default function NfseXmlViewerModal({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const { scope } = useNfseTabContext();
  const projectionQuery = useDanfseProjection(scope);
  const scopeKey = JSON.stringify(scope);
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog(onClose);
  const [prepared, setPrepared] = useState<PreparedDanfse | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const printController = useRef<AbortController | null>(null);
  const projectionController = useRef<AbortController | null>(null);

  useEffect(() => {
    setPrepared(null);
    setBusy(false);
    setPrinting(false);
    setError('');
    return () => {
      sequence.current += 1;
      printController.current?.abort();
      projectionController.current?.abort();
    };
  }, [scopeKey]);
  useEffect(() => {
    if (!prepared) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(prepared.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  const openXml = async (file?: File) => {
    if (!file) return;
    const request = ++sequence.current;
    projectionController.current?.abort();
    const controller = new AbortController();
    projectionController.current = controller;
    setPrepared(null);
    setError('');
    setBusy(true);
    try {
      if (!/\.xml$/i.test(file.name)) throw new Error('Selecione um arquivo XML.');
      if (file.size > DANFSE_XML_MAX_BYTES) throw new Error('O XML deve ter até 2 MB.');
      const document = parseDanfseXml(await file.text());
      const components = danfseComponents(document);
      const [assets, projection] = await Promise.all([
        loadDanfseAssets(),
        needsDanfseProjection(components) ? projectionQuery.mutateAsync({ components, signal: controller.signal }) : undefined,
      ]);
      if (request !== sequence.current) return;
      const blob = createDanfsePdf(document, assets, projection);
      setPrepared({ blob, filename: `DANFSe-${document.accessKey}.pdf`, number: document.number });
    } catch (cause) {
      if (request === sequence.current) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o XML.');
    } finally { if (request === sequence.current) setBusy(false); }
  };

  const print = async () => {
    if (!prepared || printing) return;
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
        <h2 id={titleId}>Visualizar NFS-e</h2>
        <button type="button" className="nfse-button nfse-button-secondary" onClick={onClose} aria-label="Fechar visualizador"><X size={17} /></button>
      </header>
      <div className="nfse-xml-toolbar">
        <label className="nfse-button nfse-button-secondary nfse-xml-file">
          <FileUp size={16} />Selecionar XML
          <input ref={initialFocusRef} type="file" accept=".xml,application/xml,text/xml" aria-label="Selecionar XML da NFS-e"
            onChange={event => { void openXml(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        <span>{prepared ? `NFS-e ${prepared.number} · Visualização do XML` : 'Arquivo NFS-e Nacional · até 2 MB'}</span>
        <div className="nfse-xml-actions">
          <button type="button" className="nfse-button nfse-button-secondary" disabled={!prepared || busy} onClick={() => prepared && downloadPdfBlob(prepared.blob, prepared.filename)}><Download size={16} />Baixar PDF</button>
          <button type="button" className="nfse-button nfse-button-primary" disabled={!prepared || busy || printing} onClick={() => void print()}>
            {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}Imprimir
          </button>
        </div>
      </div>
      {error && <p className="nfse-xml-error" role="alert">{error}</p>}
      <div className="nfse-xml-preview" aria-busy={busy}>
        {busy ? <div className="nfse-xml-empty" role="status"><Loader2 className="animate-spin" size={24} /><p>Preparando DANFSe…</p></div>
          : prepared && previewUrl ? <iframe src={previewUrl} title={`DANFSe ${prepared.number}`} />
            : <div className="nfse-xml-empty"><FileUp size={28} /><p>Selecione o XML para visualizar o DANFSe.</p></div>}
      </div>
    </div>
  </div>, document.body);
}
