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
import NfseSourceEmissionModal from '../emissao/NfseSourceEmissionModal';
import { operationLabel } from '../emissao/nfse-operation.contract';
import type { NfsePartnerServiceRow } from './types/nfse-partner-services.types';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateNfseCache } from '../queries/nfse-cache';
import NfseBatchEmissionModal from '../emissao/NfseBatchEmissionModal';

export default function ServicosParceirosNfseTab() {
  const { scope } = useNfseTabContext();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [emission, setEmission] = useState<NfsePartnerServiceRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<NfsePartnerServiceRow[] | null>(null);
  const query = useNfsePartnerServices(scope, page);
  useNfsePartnerServicesRealtime(scope);
  const { toasts, removeToast, toast } = useToast();
  const data = query.error ? undefined : query.data;
  const selectedRows = data?.rows.filter(row => selected.includes(row.id)) || [];

  return <section className="nfse-panel" aria-label="Serviços para parceiros">
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="nfse-section-heading">
      <h2>Serviços para parceiros</h2>
      <div className="nfse-partner-actions">
        <button type="button" className="nfse-button nfse-button-secondary" disabled={!selectedRows.length || query.isFetching}
          onClick={() => setBatch(selectedRows)}>Revisar lote ({selectedRows.length})</button>
        <button type="button" className="nfse-button nfse-button-secondary" onClick={() => void query.refetch()} disabled={!scope || query.isFetching}><RefreshCw size={15} className={query.isFetching ? 'animate-spin' : ''} />Atualizar</button>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!scope} onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}><Plus size={15} />Adicionar serviço</button>
      </div>
    </header>
    {data?.rows.length ? <>
      <div className="nfse-table-wrap"><table className="nfse-table nfse-partner-table">
        <thead><tr><th><input type="checkbox" aria-label="Selecionar serviços desta página" checked={selectedRows.length === data.rows.length}
          disabled={query.isFetching} onChange={event => setSelected(event.target.checked ? data.rows.map(row => row.id) : [])} /></th><th>Aluno ou parceiro</th><th>Serviço</th><th>Data da prestação</th><th>Valor</th><th>Conta a receber</th><th>Situação fiscal</th><th>Ações</th></tr></thead>
        <tbody>{data.rows.map((item) => <tr key={item.id}>
          <td><input type="checkbox" aria-label={`Selecionar serviço de ${item.partnerName}`} checked={selected.includes(item.id)} disabled={query.isFetching}
            onChange={event => setSelected(ids => event.target.checked ? [...ids.filter(id => id !== item.id), item.id] : ids.filter(id => id !== item.id))} /></td>
          <td>{item.partnerName}</td>
          <td>{item.modelName}<small>{item.serviceDescription}</small></td>
          <td>{nfsePartnerDate(item.serviceDate)}</td>
          <td className="nfse-amount">{formatNfseMoney(item.amount)}</td>
          <td>{item.receivableAction === 'CREATED' ? 'Criada' : item.receivableAction === 'LINKED' ? 'Vinculada' : 'Não gerada'}</td>
          <td><span className="nfse-status">{operationLabel(item.state)}</span>{item.number && <small>NFS-e {item.number}</small>}</td>
          <td><button type="button" className="nfse-button nfse-button-secondary" disabled={query.isFetching}
            onClick={() => setEmission(item)}>{item.operationId ? 'Consultar NFS-e' : 'Revisar e emitir'}</button></td>
        </tr>)}</tbody>
      </table></div>
      <footer className="nfse-footer"><span>Total do período: <strong>{formatNfseMoney(data.totalAmount)}</strong></span><span>{data.totalItems} serviço(s)</span></footer>
    </> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope} error={query.error}
      onRetry={() => void query.refetch()} emptyTitle="Nenhum serviço adicionado" emptyDescription="" />}
    {data && (page > 1 || data.totalItems > data.pageSize) && <NfsePager page={page} busy={query.isFetching}
      hasNext={page * data.pageSize < data.totalItems} onChange={next => { setSelected([]); setPage(next); }} />}
    {open && scope && <NfsePartnerServiceModal scope={scope} onClose={() => setOpen(false)} onSaved={(message) => {
      setOpen(false); setPage(1); toast.success('Serviço adicionado', message);
    }} />}
    {emission && scope && <NfseSourceEmissionModal scope={scope} source={{ kind: 'PARTNER_SERVICE', id: emission.id }}
      label={emission.partnerName} amount={emission.amount} operation={emission} onClose={() => setEmission(null)}
      onNotice={notice => toast[notice.type](notice.title, notice.message)} onChanged={() => {
        void invalidateNfseCache(client, scope, 'operations');
      }} />}
    {batch && scope && <NfseBatchEmissionModal scope={scope} items={batch.map(row => ({ source: { kind: 'PARTNER_SERVICE', id: row.id }, label: row.partnerName, amount: row.amount, operation: row }))}
      onClose={() => setBatch(null)} onNotice={notice => toast[notice.type](notice.title, notice.message)}
      onChanged={() => { void invalidateNfseCache(client, scope, 'operations'); }} />}
  </section>;
}
