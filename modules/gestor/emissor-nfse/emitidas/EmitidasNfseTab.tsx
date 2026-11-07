import NfseDocumentsList from '../components/NfseDocumentsList';

export default function EmitidasNfseTab() {
  return <NfseDocumentsList status="EMITIDA" title="Notas emitidas" description="Notas com autorização fiscal confirmada para este estabelecimento." emptyTitle="Nenhuma nota emitida neste período" emptyDescription="Cada emissão confirmada será identificada pelo número e pela chave de acesso." />;
}
