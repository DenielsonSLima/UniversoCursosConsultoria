import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react';
import type { NfseScope } from '../../types/nfse.types';
import { useNfseStudentsDialog } from '../../preparar/useNfseStudentsDialog';
import { downloadPdfBlob } from '../../../../shared/pdf/download-pdf-blob';
import { fetchNfseIssuedExportReport, type NfseIssuedExportFilters } from './nfse-issued-export.service';
import '../../modelos/nfse-model-form.css';
import '../../modelos/exportacao/nfse-model-export.css';
import './nfse-issued-export.css';

interface Props { scope: NfseScope; filters: NfseIssuedExportFilters; onClose: () => void }
interface Prepared { blob: Blob; fileName: string }

export default function NfseIssuedExportModal({ scope, filters, onClose }: Props) {
  const titleId = useId();
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<globalThis.HTMLButtonElement>(onClose);
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setPrepared(null); setError(''); setBusy(true);
    void fetchNfseIssuedExportReport(scope, filters, controller.signal)
      .then(async report => {
        if (controller.signal.aborted) return null;
        const { prepareNfseIssuedExportPdf } = await import('../../exportacao/interno/nfse-issued-export.resources');
        return controller.signal.aborted ? null : prepareNfseIssuedExportPdf(report);
      })
      .then(result => { if (!controller.signal.aborted && result) setPrepared(result); })
      .catch(failure => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Não foi possível preparar o relatório. Tente novamente.');
      })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [scope, filters, attempt]);
  useEffect(() => {
    if (!prepared) { setUrl(''); return; }
    const next = URL.createObjectURL(prepared.blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [prepared]);
  const ready = Boolean(prepared && url && !busy && !error);
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-model-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="nfse-model-dialog nfse-model-export-dialog nfse-issued-export-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="nfse-model-header">
        <div className="nfse-model-heading"><span className="nfse-model-heading-icon"><FileText size={19} /></span><div>
          <h2 id={titleId}>Exportar notas emitidas</h2><p>Relatório do período e dos filtros selecionados · {scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação'}</p>
        </div></div>
        <button ref={initialFocusRef} type="button" className="nfse-model-close" aria-label="Fechar exportação" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="nfse-model-export-toolbar"><span>A4 retrato · 2 linhas por nota · Resumo de valores</span>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!ready} onClick={() => prepared && ready && downloadPdfBlob(prepared.blob, prepared.fileName)}><Download size={15} />Baixar PDF</button>
      </div>
      <div className="nfse-issued-export-body">
        <aside className="nfse-issued-export-models" aria-label="Modelos de exportação">
          <div className="nfse-issued-export-folder"><FolderOpen size={18} />Modelos</div>
          <button type="button" className="nfse-issued-export-model" aria-pressed="true"><FileText size={16} /><span>Modelo interno<small>Notas emitidas</small></span></button>
        </aside>
        <div className="nfse-model-export-preview" aria-busy={busy}>
          {error ? <div className="nfse-model-export-state" role="alert"><p>{error}</p><button type="button" className="nfse-button nfse-button-secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />Tentar novamente</button></div>
            : ready ? <iframe src={url} tabIndex={0} title="Relatório de notas emitidas · Modelo interno" />
              : <div className="nfse-model-export-state" role="status"><Loader2 size={23} className="animate-spin" /><p>Preparando o PDF com todas as notas do período e dos filtros selecionados…</p></div>}
        </div>
      </div>
      <footer className="nfse-model-export-footer">A prévia e o download utilizam o mesmo PDF. A exportação inclui todas as notas filtradas, independentemente da página ou da seleção para ZIP.</footer>
    </div>
  </div>, document.body);
}
