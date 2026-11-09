import { useDeferredValue, useState, type ReactNode } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { useNfseDocuments } from '../hooks/useNfseQueries';
import type { NfseDocumentStatus } from '../types/nfse.types';
import { useNfseTabContext } from './NfseTabContext';
import NfseDataState from './NfseDataState';
import NfsePager from './NfsePager';
import { formatNfseMoney } from './nfse.presentation';

const labels: Record<NfseDocumentStatus, string> = {
  PENDENTE: 'Pendente', EM_PROCESSAMENTO: 'Em processamento', AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação', EMITIDA: 'Emitida', ERRO: 'Com erro',
};

interface Props {
  status: 'PENDENTE' | 'EMITIDA' | 'ERRO';
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  actions?: ReactNode;
}

export default function NfseDocumentsList({ status, title, description, emptyTitle, emptyDescription, actions }: Props) {
  const { scope, unavailable, canRead, loading } = useNfseTabContext();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const query = useNfseDocuments(canRead ? scope : null, { status, search: deferredSearch, page });
  const rows = query.error ? [] : query.data?.rows || [];

  return (
    <section className="nfse-panel" aria-label={title}>
      <div className="nfse-section-heading"><div><h2>{title}</h2><p>{description}</p></div>
        {actions}
        {status !== 'EMITIDA' && <button type="button" className="nfse-button nfse-button-primary" disabled title="Disponível após a habilitação da emissão fiscal">{status === 'ERRO' ? <RotateCcw size={15} /> : <Play size={15} />}{status === 'ERRO' ? 'Reprocessar corrigidas' : 'Emitir lote'}</button>}
      </div>
      <div className="nfse-toolbar"><div className="nfse-field"><label htmlFor={`nfse-search-${status}`}>Buscar registros</label><input id={`nfse-search-${status}`} type="search" value={search} disabled={!canRead} placeholder="Buscar aluno ou nota…" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><span className="nfse-inline-help">{query.data ? `${query.data.totalItems} registro(s)` : 'Registros do polo e período selecionados'}</span></div>
      {rows.length ? <div className="nfse-table-wrap"><table className="nfse-table">
        <thead><tr><th>Aluno / turma</th><th>Modelo</th><th>Valor do serviço</th><th>Situação</th><th>{status === 'ERRO' ? 'Motivo e correção' : 'Nota fiscal'}</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}>
          <td>{item.studentName}<small>{item.classLabel}</small></td><td>{item.modelLabel}</td><td className="nfse-amount">{formatNfseMoney(item.amount)}</td>
          <td><span className="nfse-status" data-tone={item.status === 'EMITIDA' ? 'success' : item.status === 'ERRO' ? 'error' : 'warning'}>{labels[item.status]}</span></td>
          <td>{status === 'ERRO' ? <div className="nfse-error-detail">{item.errorCode && <strong>{item.errorCode} · </strong>}{item.errorMessage || 'Consulte o retorno fiscal antes de tentar novamente.'}<small>{item.retryable ? 'Pode ser reprocessada após correção.' : 'Requer conferência antes de nova tentativa.'}</small></div> : <>{item.number || 'Ainda não emitida'}{item.accessKey && <small className="break-all">Chave: {item.accessKey}</small>}{item.status === 'AGUARDANDO_CONFIRMACAO' && <small>Aguardando a consulta de confirmação para evitar duplicidade.</small>}</>}</td>
        </tr>)}</tbody>
      </table></div> : <NfseDataState loading={loading || (canRead && query.isPending)} unavailable={unavailable} error={query.error} onRetry={() => void query.refetch()} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />}
      {query.data && <NfsePager page={query.data.page} hasNext={query.data.page * query.data.pageSize < query.data.totalItems} busy={query.isFetching} onChange={setPage} />}
      {status !== 'EMITIDA' && <div className="nfse-footer"><p>{status === 'ERRO' ? 'As notas já autorizadas são preservadas. Cada falha é tratada individualmente.' : 'A emissão em lote será liberada após a validação da integração fiscal.'}</p></div>}
    </section>
  );
}
