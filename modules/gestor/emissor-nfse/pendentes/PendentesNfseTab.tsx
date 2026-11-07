import NfseDocumentsList from '../components/NfseDocumentsList';

export default function PendentesNfseTab() {
  return <NfseDocumentsList status="PENDENTE" title="Pendentes de emissão" description="Confira os documentos preparados e acompanhe o processamento do lote." emptyTitle="Nenhuma nota pendente" emptyDescription="Os registros confirmados em Preparar emissão aparecerão aqui antes da transmissão." />;
}
