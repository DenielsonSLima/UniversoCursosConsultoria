import { lazy, Suspense, useState } from 'react';
import { FileSearch } from 'lucide-react';
import NfseDocumentsList from '../components/NfseDocumentsList';

const NfseXmlViewerModal = lazy(() => import('../visualizador/NfseXmlViewerModal'));

export default function EmitidasNfseTab() {
  const [viewerOpen, setViewerOpen] = useState(false);
  return <>
    <NfseDocumentsList status="EMITIDA" title="Notas emitidas" description="Notas com autorização fiscal confirmada para este estabelecimento." emptyTitle="Nenhuma nota emitida neste período" emptyDescription="Cada emissão confirmada será identificada pelo número e pela chave de acesso."
      actions={<button type="button" className="nfse-button nfse-button-secondary" onClick={() => setViewerOpen(true)}><FileSearch size={15} />Visualizar XML</button>} />
    {viewerOpen && <Suspense fallback={<p role="status">Abrindo visualizador…</p>}><NfseXmlViewerModal onClose={() => setViewerOpen(false)} /></Suspense>}
  </>;
}
