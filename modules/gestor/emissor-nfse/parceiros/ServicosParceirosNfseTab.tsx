import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import NfsePager from '../components/NfsePager';
import { formatNfseMoney } from '../components/nfse.presentation';
import { useNfsePartnerServices } from './hooks/useNfsePartnerServices';
import { useNfsePartnerServicesRealtime } from './realtime/useNfsePartnerServicesRealtime';
import NfsePartnerServiceModal from './NfsePartnerServiceModal';
import { nfsePartnerDate } from './nfse-partner-services.presentation';
import './nfse-partner-services.css';

export default function ServicosParceirosNfseTab() {
  const { scope } = useNfseTabContext();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const query = useNfsePartnerServices(scope, page);
  useNfsePartnerServicesRealtime(scope);
  const { toasts, removeToast, toast } = useToast();
  const data = query.error ? undefined : query.data;

  return <section className="nfse-panel" aria-label="Serviços para parceiros">
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="nfse-section-heading">
      <h2>Serviços para parceiros</h2>
      <div className="nfse-partner-actions">
        <button type="button" className="nfse-button nfse-button-secondary" onClick={() => void query.refetch()} disabled={!scope || query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'animate-spin' : ''} />Atualizar</button>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!scope} onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}><Plus size={15} />Adicionar serviço</button>
      </div>
    </header>
    {data?.rows.length ? <>
      <div className="nfse-table-wrap"><table className="nfse-table nfse-partner-table">
        <thead><tr><th>Parceiro</th><th>Serviço</th><th>Data da prestação</th><th>Valor</th><th>Conta a receber</th><th>Situação</th></tr></thead>
        <tbody>{data.rows.map((item) => <tr key={item.id}>
          <td>{item.partnerName}</td>
          <td>{item.modelName}<small>{item.serviceDescription}</small></td>
          <td>{nfsePartnerDate(item.serviceDate)}</td>
          <td className="nfse-amount">{formatNfseMoney(item.amount)}</td>
          <td>{item.receivableAction === 'CREATED' ? 'Criada' : item.receivableAction === 'LINKED' ? 'Vinculada' : 'Não gerada'}</td>
          <td><span className="nfse-status">Preparado</span></td>
        </tr>)}</tbody>
      </table></div>
      <footer className="nfse-footer"><span>Total do período: <strong>{formatNfseMoney(data.totalAmount)}</strong></span><span>{data.totalItems} serviço(s)</span></footer>
    </> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope} error={query.error}
      onRetry={() => void query.refetch()} emptyTitle="Nenhum serviço adicionado" emptyDescription="" />}
    {data && (page > 1 || data.totalItems > data.pageSize) && <NfsePager page={page} busy={query.isFetching}
      hasNext={page * data.pageSize < data.totalItems} onChange={setPage} />}
    {open && scope && <NfsePartnerServiceModal scope={scope} onClose={() => setOpen(false)} onSaved={(message) => {
      setOpen(false); setPage(1); toast.success('Serviço adicionado', message);
    }} />}
  </section>;
}
