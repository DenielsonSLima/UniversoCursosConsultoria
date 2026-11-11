import { lazy, Suspense, useState } from 'react';
import { Download, X } from 'lucide-react';
import NfseDocumentsList from '../components/NfseDocumentsList';
import { useNfseTabContext } from '../components/NfseTabContext';
import type { NfseDocument } from '../types/nfse.types';
import NfseDocumentActions from './NfseDocumentActions';
import { useNfseDownloads } from './useNfseDownloads';
import './nfse-issued-downloads.css';
import { useNfseIssuedSelection } from '../visualizador/hooks/useNfseIssuedSelection';

const NfseXmlViewerModal = lazy(() => import('../visualizador/NfseXmlViewerModal'));

export default function EmitidasNfseTab({ issuedState = 'ACTIVE' }: { issuedState?: 'ACTIVE' | 'CANCELLED' }) {
  const { scope, canRead } = useNfseTabContext();
  const scopeKey = JSON.stringify([scope, issuedState]);
  const [selected, setSelected] = useState<{ document: NfseDocument; scopeKey: string } | null>(null);
  const [checked, setChecked] = useState<{ scopeKey: string; ids: ReadonlySet<string> }>({ scopeKey, ids: new Set() });
  const ids = checked.scopeKey === scopeKey ? checked.ids : new Set<string>();
  const downloads = useNfseDownloads(scope, canRead);
  const document = useNfseIssuedSelection(scope, canRead && selected?.scopeKey === scopeKey ? selected.document : null);
  return <>
    <NfseDocumentsList status="EMITIDA" issuedState={issuedState} title={issuedState === 'CANCELLED' ? 'Notas canceladas' : 'Notas emitidas'} description="Autorizações deste estabelecimento, com a situação fiscal confirmada."
      emptyTitle={issuedState === 'CANCELLED' ? 'Nenhuma nota cancelada neste período' : 'Nenhuma nota emitida neste período'} emptyDescription="Cada emissão confirmada será identificada pelo número e pela chave de acesso."
      selection={{ ids, disabled: downloads.busy,
        onReset: () => { downloads.cancel(); setChecked({ scopeKey, ids: new Set() }); },
        onTogglePage: (rows, value) => setChecked({ scopeKey, ids: new Set(value ? rows.map(item => item.id) : []) }),
        onToggle: (item, value) => setChecked(previous => {
          const next = new Set(previous.scopeKey === scopeKey ? previous.ids : []);
          if (value) next.add(item.id); else next.delete(item.id);
          return { scopeKey, ids: next };
        }) }}
      selectionActions={(rows, available) => <div className="nfse-issued-downloads">
        <span className="nfse-inline-help">{rows.length} selecionada(s) · página atual</span>
        <button type="button" className="nfse-button nfse-button-secondary" disabled={!available || !rows.length || downloads.busy}
          onClick={() => downloads.download(rows, 'pdf', true)}><Download size={15} />ZIP de PDFs</button>
        <button type="button" className="nfse-button nfse-button-secondary" disabled={!available || !rows.length || downloads.busy}
          onClick={() => downloads.download(rows, 'xml', true)}><Download size={15} />ZIP de XMLs</button>
        {downloads.busy && <button type="button" className="nfse-button nfse-button-secondary" onClick={downloads.cancel}><X size={15} />Cancelar download</button>}
        {downloads.message && <p className="nfse-inline-help" role="status" aria-live="polite">{downloads.message}</p>}
        {downloads.error && <p className="nfse-download-error" role="alert">{downloads.error}</p>}
      </div>}
      documentActions={(item, available) => <NfseDocumentActions number={item.number}
        disabled={!available || downloads.busy || item.status !== 'EMITIDA'
          || !/^\d{1,15}$/.test(item.number ?? '') || !/^\d{50}$/.test(item.accessKey ?? '')}
        onPreview={() => setSelected({ document: item, scopeKey })}
        onPdf={() => downloads.download([item], 'pdf')} onXml={() => downloads.download([item], 'xml')} />} />
    {document && <Suspense fallback={<p role="status">Abrindo visualizador…</p>}>
      <NfseXmlViewerModal key={`${scopeKey}:${document.id}:${document.state || ''}:${document.cancelPreviewId || ''}`} document={document} onClose={() => setSelected(null)} />
    </Suspense>}
  </>;
}
