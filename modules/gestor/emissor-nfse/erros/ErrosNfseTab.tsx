import NfseDocumentsList from '../components/NfseDocumentsList';

export default function ErrosNfseTab() {
  return <NfseDocumentsList status="ERRO" title="Erros de emissão" description="Consulte o motivo de cada falha e corrija os itens que precisam de atenção." emptyTitle="Nenhum erro registrado neste período" emptyDescription="As falhas de cada nota aparecerão aqui, sem impedir o processamento das demais." />;
}
