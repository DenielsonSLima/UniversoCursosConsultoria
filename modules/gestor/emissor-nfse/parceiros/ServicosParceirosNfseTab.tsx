import ConfirmModal from '../../components/ConfirmModal';
import NfsePartnerServiceFilters from './NfsePartnerServiceFilters';
import { NFSE_PARTNER_SERVICE_FILTERS, type NfsePartnerServiceFilters as Filters } from './types/nfse-partner-services.types';
import { createPartnerRemovalAttempt } from './services/nfse-partner-list.contract';
import React, { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import NfsePager from '../components/NfsePager';
import { formatNfseMoney } from '../components/nfse.presentation';
import { useNfsePartnerServices, useRemoveNfsePartnerServices } from './hooks/useNfsePartnerServices';
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
  const [filters, setFilters] = useState<Filters>({ ...NFSE_PARTNER_SERVICE_FILTERS });
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const remove = useRemoveNfsePartnerServices(scope);
  const attempt = useRef(createPartnerRemovalAttempt());
  const submitting = useRef(false);
  const busy = remove.isPending;
  const [open, setOpen] = useState(false);
  const [emission, setEmission] = useState<NfsePartnerServiceRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<NfsePartnerServiceRow[] | null>(null);
  const query = useNfsePartnerServices(scope, page, filters);
  useNfsePartnerServicesRealtime(scope);
  const { toasts, removeToast, toast } = useToast();
  const data = query.error ? undefined : query.data;
  const selectedRows = data?.rows.filter(row => selected.includes(row.id)) || [];
  const eligibleIds = data?.rows.filter(row => row.canRemove).map(row => row.id) || [];
  const visibleIds = data?.rows.map(row => row.id) || [];
  const allSelected = visibleIds.length > 0 && selectedRows.length === visibleIds.length;
  const canRemoveSelection = selectedRows.length > 0 && selectedRows.every(row => row.canRemove);
  const blocked = busy || query.isFetching;

  useEffect(() => {
    if (!data || query.isFetching) return;
    setSelected(ids => ids.filter(id => data.rows.some(row => row.id === id)));
    const lastPage = Math.max(1, Math.ceil(data.totalItems / data.pageSize));
    if (page > lastPage) { setPage(lastPage); setSelected([]); }
  }, [data, page, query.isFetching]);
  const changeFilters = (next: Partial<Filters>) => {
    setFilters(previous => ({ ...previous, ...next })); setPage(1); setSelected([]); setConfirmation(null);
  };
  const confirmRemoval = async () => {
    if (!scope || !confirmation?.length || submitting.current) return;
    submitting.current = true;
    try {
      const { result } = await remove.mutateAsync(attempt.current(scope, confirmation));
      setSelected([]); toast.success('Serviços excluídos', result.message);
    } catch (error) {
      toast.error('Exclusão não confirmada', error instanceof Error ? error.message : 'Atualize a seleção e tente novamente.');
    } finally { submitting.current = false; }
  };

  return <section className="nfse-panel" aria-label="Serviços para parceiros" aria-busy={busy}>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="nfse-section-heading">
      <h2>Serviços para parceiros</h2>
      <div className="nfse-partner-actions">
        <button type="button" className="nfse-button nfse-button-danger" disabled={!scope || !canRemoveSelection || blocked}
          onClick={() => setConfirmation(selectedRows.map(row => row.id))}><Trash2 size={15} />{busy ? 'Excluindo…' : `Excluir selecionados (${selectedRows.length})`}</button>
        <button type="button" className="nfse-button nfse-button-secondary" disabled={!selectedRows.length || blocked}
          onClick={() => setBatch(selectedRows)}>Revisar lote ({selectedRows.length})</button>
        <button type="button" className="nfse-button nfse-button-secondary" onClick={() => void query.refetch()} disabled={!scope || blocked}><RefreshCw size={15} className={query.isFetching ? 'animate-spin' : ''} />Atualizar</button>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!scope || busy} onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}><Plus size={15} />Adicionar serviço</button>
      </div>
    </header>
    <NfsePartnerServiceFilters value={filters} disabled={!scope || busy} onChange={changeFilters} />
    {data?.rows.length ? <>
      <div className="nfse-partner-selection" aria-live="polite">
        <span>{selectedRows.length} selecionado(s) nesta página</span>
        <button type="button" className="nfse-button nfse-button-secondary" disabled={blocked || !eligibleIds.length}
          onClick={() => setSelected(eligibleIds)}>Selecionar não emitidos</button>
        {selectedRows.length > 0 && <button type="button" className="nfse-button nfse-button-secondary" disabled={busy}
          onClick={() => setSelected([])}>Limpar seleção</button>}
        <span>Notas emitidas, canceladas ou em processamento não podem ser excluídas.</span>
      </div>
      <div className="nfse-table-wrap"><table className="nfse-table nfse-partner-table">
        <thead><tr><th className="nfse-selection-cell"><input type="checkbox" aria-label="Selecionar serviços desta página" checked={allSelected}
          ref={element => { if (element) element.indeterminate = selectedRows.length > 0 && !allSelected; }}
          disabled={blocked || !visibleIds.length} onChange={event => setSelected(event.target.checked ? visibleIds : [])} /></th><th>Aluno ou parceiro</th><th>Serviço</th><th>Data da prestação</th><th>Valor</th><th>Conta a receber</th><th>Situação fiscal</th><th>Ações</th></tr></thead>
        <tbody>{data.rows.map((item) => <tr key={item.id}>
          <td className="nfse-selection-cell"><input type="checkbox" aria-label={`Selecionar serviço de ${item.partnerName}`} checked={selected.includes(item.id)} disabled={blocked}
            title={item.canRemove ? 'Selecionar serviço' : 'Selecionar para revisão; protegido contra exclusão'}
            onChange={event => setSelected(ids => event.target.checked ? [...ids.filter(id => id !== item.id), item.id] : ids.filter(id => id !== item.id))} /></td>
          <td>{item.partnerName}<small>{item.partnerType === 'PJ' ? 'Pessoa jurídica (PJ)' : item.partnerType === 'PF' ? 'Pessoa física (PF)' : item.partnerType === 'ALUNO' ? 'Aluno' : ''}</small></td>
          <td>{item.modelName}<small>{item.serviceDescription}</small></td>
          <td>{nfsePartnerDate(item.serviceDate)}</td>
          <td className="nfse-amount">{formatNfseMoney(item.amount)}</td>
          <td>{item.receivableAction === 'CREATED' ? 'Criada' : item.receivableAction === 'LINKED' ? 'Vinculada' : 'Não gerada'}</td>
          <td><span className="nfse-status">{operationLabel(item.state)}</span>{item.number && <small>NFS-e {item.number}</small>}</td>
          <td><button type="button" className="nfse-button nfse-button-secondary" disabled={blocked}
            onClick={() => setEmission(item)}>{!item.state || item.state === 'PREVIEWED' ? 'Emitir NFS-e' : 'Consultar NFS-e'}</button></td>
        </tr>)}</tbody>
      </table></div>
      <footer className="nfse-footer"><span>Total filtrado: <strong>{formatNfseMoney(data.totalAmount)}</strong></span><span>{data.totalItems} serviço(s)</span></footer>
    </> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope} error={query.error}
      onRetry={() => void query.refetch()} emptyTitle="Nenhum serviço encontrado" emptyDescription="Revise a busca, o período e o tipo de parceiro." />}
    {data && data.totalItems > 0 && <NfsePager page={page} busy={blocked}
      hasNext={page * data.pageSize < data.totalItems} onChange={next => { setSelected([]); setConfirmation(null); setPage(next); }} />}
    {open && scope && <NfsePartnerServiceModal scope={scope} onClose={() => setOpen(false)} onSaved={(message) => {
      setOpen(false); setPage(1); setSelected([]); toast.success('Serviço adicionado', message);
    }} />}
    {emission && scope && <NfseSourceEmissionModal scope={scope} source={{ kind: 'PARTNER_SERVICE', id: emission.id }}
      label={emission.partnerName} amount={emission.amount} operation={emission} onClose={() => setEmission(null)}
      onNotice={notice => toast[notice.type](notice.title, notice.message)} onChanged={() => {
        void invalidateNfseCache(client, scope, 'operations');
      }} />}
    {batch && scope && <NfseBatchEmissionModal scope={scope} items={batch.map(row => ({ source: { kind: 'PARTNER_SERVICE', id: row.id }, label: row.partnerName, amount: row.amount, operation: row }))}
      onClose={() => setBatch(null)} onNotice={notice => toast[notice.type](notice.title, notice.message)}
      onChanged={() => { void invalidateNfseCache(client, scope, 'operations'); }} />}
    <ConfirmModal isOpen={Boolean(confirmation)} onClose={() => setConfirmation(null)} onConfirm={() => void confirmRemoval()}
      title="Excluir serviços não emitidos?" confirmText="Excluir da lista" cancelText="Voltar"
      message={`Excluir ${confirmation?.length ?? 0} serviço(s) selecionado(s) desta lista? Somente preparações sem emissão ou rejeições definitivas podem ser excluídas. O histórico fiscal, as contas a receber e os recebimentos serão preservados. Esta ação não cancela NFS-e.`} />
  </section>;
}

