import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Loader2, RefreshCw, X } from 'lucide-react';
import type { NfseModel, NfseScope } from '../types/nfse.types';
import { useNfseStudentsDialog } from '../preparar/useNfseStudentsDialog';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { useNfseModelIssuerMetadata } from './hooks/useNfseModelIssuerMetadata';
import { useNfseFiscalCatalogs } from './hooks/useNfseFiscalCatalogs';
import { nfseIbsCbsClassifications, nfsePresumedCredits } from './catalogs/nfse-ibscbs.catalog';
import { createNfseModelExportReport } from './exportacao/nfse-model-export.projection';
import './nfse-model-form.css';
import './exportacao/nfse-model-export.css';

interface Props { model: NfseModel; scope: NfseScope; onClose: () => void }
interface Prepared { blob: Blob; fileName: string }
const valuesCatalogs = { classifications: nfseIbsCbsClassifications, credits: nfsePresumedCredits };

export default function NfseModelExportModal({ model, scope, onClose }: Props) {
  const titleId = useId();
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<globalThis.HTMLButtonElement>(onClose);
  const issuer = useNfseModelIssuerMetadata(scope);
  const catalogs = useNfseFiscalCatalogs();
  const [generatedAt] = useState(() => new Date().toISOString());
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const loading = issuer.isPending || issuer.isFetching || catalogs.isPending;
  const queryFailed = Boolean(issuer.error || catalogs.error);
  const report = useMemo(() => !issuer.data || !catalogs.data || loading || queryFailed ? null
    : createNfseModelExportReport(model, scope, issuer.data, { fiscal: catalogs.data, values: valuesCatalogs,
      profile: scope.environment === 'PRODUCAO' ? 'PRODUCTION_20260209' : 'HOMOLOGATION_20261020' }, generatedAt),
  [model, scope, issuer.data, catalogs.data, loading, queryFailed, generatedAt]);
  useEffect(() => {
    let active = true;
    setPrepared(null); setError(''); setBusy(Boolean(report));
    if (report) void import('./exportacao/nfse-model-export.pdf').then(({ prepareNfseModelExportPdf }) => prepareNfseModelExportPdf(report))
      .then(result => { if (active) setPrepared(result); })
      .catch(() => { if (active) setError('Não foi possível gerar o relatório deste pré-modelo. Tente novamente.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [report, attempt]);
  useEffect(() => {
    if (!prepared) { setUrl(''); return; }
    const next = URL.createObjectURL(prepared.blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [prepared]);
  const unavailable = queryFailed ? 'Não foi possível consultar a configuração da unidade ou os catálogos. Recarregue os dados para exportar o relatório completo.' : error;
  const ready = Boolean(prepared && url && !busy && !loading && !unavailable);
  const retry = () => { if (queryFailed) { void issuer.refetch(); void catalogs.refetch(); } setAttempt(value => value + 1); };
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-model-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="nfse-model-dialog nfse-model-export-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="nfse-model-header">
        <div className="nfse-model-heading"><span className="nfse-model-heading-icon"><FileText size={19} /></span><div>
          <h2 id={titleId}>Exportar pré-modelo</h2><p>{model.name} · Versão {model.version} · {scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação'}</p>
        </div></div>
        <button ref={initialFocusRef} type="button" className="nfse-model-close" aria-label="Fechar exportação" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="nfse-model-export-toolbar"><span>Relatório completo para revisão contábil</span>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!ready} onClick={() => prepared && ready && downloadPdfBlob(prepared.blob, prepared.fileName)}><Download size={15} />Baixar PDF</button>
      </div>
      <div className="nfse-model-export-preview" aria-busy={busy || loading}>
        {unavailable ? <div className="nfse-model-export-state" role="alert"><p>{unavailable}</p><button type="button" className="nfse-button nfse-button-secondary" onClick={retry}><RefreshCw size={15} />Tentar novamente</button></div>
          : ready ? <iframe src={url} tabIndex={0} title={`Relatório do pré-modelo ${model.name}`} />
            : <div className="nfse-model-export-state" role="status"><Loader2 size={23} className="animate-spin" /><p>Preparando o relatório com as regras e a configuração consultada…</p></div>}
      </div>
      <footer className="nfse-model-export-footer">A prévia e o download utilizam o mesmo PDF. As regras que dependem da emissão são identificadas no relatório.</footer>
    </div>
  </div>, document.body);
}
