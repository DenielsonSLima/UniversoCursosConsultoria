import { useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import NfsePager from '../components/NfsePager';
import { formatNfseMoney } from '../components/nfse.presentation';
import { useNfseQueue } from '../fila/useNfseQueue';
import { NfseUnavailableError } from '../services/nfse.errors';
import { formatNfseMonth } from '../preparar/nfse-month.presentation';
import { nfseQueueBlockingLabel } from '../fila/nfse-queue.presentation';

export default function PendentesNfseTab() {
  const { scope } = useNfseTabContext();
  const [page, setPage] = useState(1);
  const query = useNfseQueue(scope, page);
  const data = query.error ? undefined : query.data;
  return <section className="nfse-panel" aria-label="Pendentes de emissão">
    <header className="nfse-section-heading">
      <div><h2>Pendentes de emissão</h2><p>Recebimentos reservados e dados preservados para a conferência fiscal.</p></div>
      <div className="nfse-queue-actions">
        <button type="button" className="nfse-button nfse-button-secondary" disabled={!scope || query.isFetching}
          onClick={() => void query.refetch()}><RefreshCw size={15} />Atualizar</button>
        <button type="button" className="nfse-button nfse-button-primary" disabled title="Disponível após configurar e homologar a integração fiscal"><Play size={15} />Emitir notas</button>
      </div>
    </header>
    {data?.rows.length ? <>
      <div className="nfse-table-wrap"><table className="nfse-table">
        <thead><tr><th>Aluno / turma</th><th>Modelo</th><th>Recebimentos</th><th>Valor do serviço</th><th>Situação</th></tr></thead>
        <tbody>{data.rows.map(item => <tr key={item.id}>
          <td>{item.studentName}<small>{item.classLabel}</small></td>
          <td>{item.modelLabel}</td>
          <td>{item.receiptCount} recebimento(s)<small>{formatNfseMonth(item.paymentMonth)}</small></td>
          <td className="nfse-amount">{formatNfseMoney(item.amount)}</td>
          <td><span className="nfse-status" data-tone="warning">Preparado</span>
            {item.blockingReasons.map(reason => <small key={reason}>{nfseQueueBlockingLabel(reason)}</small>)}</td>
        </tr>)}</tbody>
      </table></div>
      <footer className="nfse-footer"><span>{data.totalItems} documento(s)</span><span>Total preparado: <strong>{formatNfseMoney(data.totalAmount)}</strong></span></footer>
    </> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope || query.error instanceof NfseUnavailableError}
      error={query.error} onRetry={() => void query.refetch()} emptyTitle="Nenhuma nota pendente"
      emptyDescription="Adicione os alunos e confirme a preparação para reservar os recebimentos." />}
    {data && (page > 1 || data.totalItems > data.pageSize) && <NfsePager page={page} busy={query.isFetching}
      hasNext={page * data.pageSize < data.totalItems} onChange={setPage} />}
    <div className="nfse-footer"><p>A preparação não emite nota. A transmissão depende da conferência fiscal e da homologação do estabelecimento.</p></div>
  </section>;
}
