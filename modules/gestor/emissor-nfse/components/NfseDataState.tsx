import { AlertCircle, FileText, Loader2, RefreshCw } from 'lucide-react';

interface NfseDataStateProps {
  loading?: boolean;
  error?: Error | null;
  unavailable?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
}

export default function NfseDataState({
  loading, error, unavailable, emptyTitle = 'Nenhum registro neste período',
  emptyDescription = 'Os registros deste polo aparecerão aqui.', onRetry,
}: NfseDataStateProps) {
  const Icon = loading ? Loader2 : error ? AlertCircle : FileText;
  return (
    <div className="nfse-empty" role={error && !unavailable ? 'alert' : 'status'}>
      <Icon size={23} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
      <strong>{loading ? 'Carregando registros…' : unavailable ? 'Integração fiscal em preparação' : error ? 'Não foi possível carregar os registros' : emptyTitle}</strong>
      <p>{loading ? 'Aguarde a consulta deste polo.' : unavailable
        ? 'Os dados serão disponibilizados quando a integração deste estabelecimento estiver habilitada.'
        : error ? 'Tente novamente. A seleção anterior não confirma nenhuma operação.' : emptyDescription}</p>
      {error && !unavailable && onRetry && <button type="button" className="nfse-button nfse-button-secondary" onClick={onRetry}><RefreshCw size={14} />Tentar novamente</button>}
    </div>
  );
}
