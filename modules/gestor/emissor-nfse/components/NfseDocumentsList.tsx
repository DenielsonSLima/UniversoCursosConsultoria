import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNfseDocuments } from '../hooks/useNfseQueries';
import type { NfseDocument, NfseDocumentStatus } from '../types/nfse.types';
import { useNfseTabContext } from './NfseTabContext';
import NfseDataState from './NfseDataState';
import NfsePager from './NfsePager';
import { formatNfseMoney } from './nfse.presentation';
import { operationLabel } from '../emissao/nfse-operation.contract';
import NfseDocumentOperationAction from '../emissao/NfseDocumentOperationAction';
import NfseIssuedFilters, { type NfseIssuedFilterValues } from '../emitidas/NfseIssuedFilters';
import NfseIssuedRows from '../emitidas/NfseIssuedRows';
import { NfseAccessError } from '../services/nfse.errors';
import { useNfseIssuedPeriod } from '../emitidas/NfseIssuedPeriodContext';
import { createNfseIssuedPeriod } from '../emitidas/nfse-issued-period';

const labels: Record<NfseDocumentStatus, string> = {
  PENDENTE: 'Pendente', EM_PROCESSAMENTO: 'Em processamento', AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação', EMITIDA: 'Emitida', ERRO: 'Com erro',
};

interface Props {
  status: 'PENDENTE' | 'EMITIDA' | 'ERRO';
  issuedState?: 'ACTIVE' | 'CANCELLED';
  errorArchiveMode?: 'ACTIVE' | 'ARCHIVED';
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  actions?: ReactNode;
  documentActions?: (document: NfseDocument, available: boolean) => ReactNode;
  operationActions?: (document: NfseDocument, available: boolean) => ReactNode;
  selection?: {
    ids: ReadonlySet<string>; disabled: boolean;
    onToggle: (document: NfseDocument, checked: boolean) => void;
    onTogglePage: (documents: NfseDocument[], checked: boolean) => void;
    onReset: () => void;
    isSelectable?: (document: NfseDocument) => boolean;
  };
  selectionActions?: (documents: NfseDocument[], available: boolean) => ReactNode;
}

export default function NfseDocumentsList({ status, issuedState, errorArchiveMode, title, description, emptyTitle, emptyDescription, actions,
  documentActions, operationActions, selection, selectionActions }: Props) {
  const { scope, unavailable, canRead, loading } = useNfseTabContext();
  const period = useNfseIssuedPeriod();
  const sharedPeriod = status === 'EMITIDA' && issuedState !== 'CANCELLED' ? period : null;
  const [localSearch, setLocalSearch] = useState('');
  const search = sharedPeriod?.filters.search ?? localSearch;
  const setSearch = (value: string) => sharedPeriod ? sharedPeriod.setFilters({ search: value }) : setLocalSearch(value);
  const [page, setPage] = useState(1);
  const [localFilters, setLocalFilters] = useState<NfseIssuedFilterValues>(() => status === 'EMITIDA' && issuedState !== 'CANCELLED'
    ? createNfseIssuedPeriod(scope?.month) : { dateFrom: '', dateTo: '', courseType: '', origin: '' });
  const filters = sharedPeriod?.filters ?? localFilters;
  const setFilters = (next: Partial<NfseIssuedFilterValues>) => sharedPeriod ? sharedPeriod.setFilters(next)
    : setLocalFilters(previous => ({ ...previous, ...next }));
  const deferredSearch = useDeferredValue(search.trim());
  const invalidDates = status === 'EMITIDA' && Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
  const query = useNfseDocuments(canRead ? scope : null, { status, page, ...(status === 'EMITIDA' ? { ...filters, issuedState } : {}), search: deferredSearch,
    ...(status === 'ERRO' ? { errorArchiveMode } : {}) }, !invalidDates);
  const scopeKey = JSON.stringify([scope, status, issuedState, errorArchiveMode]), accessDenied = query.error instanceof NfseAccessError;
  const lastSuccess = useRef<{ scopeKey: string; data: typeof query.data } | null>(null);
  if (query.data && !query.error && !query.isPending) lastSuccess.current = { scopeKey, data: query.data };
  if (accessDenied) lastSuccess.current = null;
  const previousData = status === 'EMITIDA' && lastSuccess.current?.scopeKey === scopeKey ? lastSuccess.current.data : undefined;
  const data = accessDenied ? undefined : query.error || !query.data ? previousData : query.data;
  const rows = data?.rows || [];
  const available = canRead && !invalidDates && !query.error && !query.isFetching && !sharedPeriod?.isSettling;
  const selectableRows = rows.filter(item => selection?.isSelectable ? selection.isSelectable(item)
    : item.status === 'EMITIDA' && /^\d{50}$/.test(item.accessKey ?? '') && /^\d{1,15}$/.test(item.number ?? ''));
  const allSelected = selectableRows.length > 0 && selectableRows.every(item => selection?.ids.has(item.id));
  const someSelected = selectableRows.some(item => selection?.ids.has(item.id));
  useEffect(() => {
    if (!query.data || query.error) return;
    const lastPage = Math.max(1, Math.ceil(query.data.totalItems / query.data.pageSize));
    if (page > lastPage) { selection?.onReset(); setPage(lastPage); }
  }, [page, query.data, query.error, selection]);

  return (
    <section className={`nfse-panel${status === 'EMITIDA' ? ' nfse-issued-panel' : ''}`} aria-label={title}>
      {status !== 'EMITIDA' && <div className="nfse-section-heading"><div><h2>{title}</h2><p>{description}</p></div>
        {actions}
      </div>}
      {status !== 'EMITIDA' && <div className="nfse-toolbar"><div className="nfse-field"><label htmlFor={`nfse-search-${status}`}>Buscar registros</label><input id={`nfse-search-${status}`} type="search" value={search} disabled={!canRead || selection?.disabled} placeholder="Buscar aluno ou nota…" onChange={(event) => { selection?.onReset(); setSearch(event.target.value); setPage(1); }} /></div><span className="nfse-inline-help">{!query.error && query.data ? `${query.data.totalItems} registro(s)` : 'Registros do polo e período selecionados'}</span>
        {selectionActions?.(rows.filter(item => selection?.ids.has(item.id)), available)}
      </div>}
      {status === 'EMITIDA' && <NfseIssuedFilters onDraftChange={sharedPeriod?.setDatesPending} value={filters} courseTypes={data?.courseTypes || []} disabled={!canRead || accessDenied || Boolean(selection?.disabled)}
        search={search} searchDisabled={!canRead || accessDenied || Boolean(selection?.disabled)} onSearch={next => { selection?.onReset(); setSearch(next); setPage(1); }}
        onChange={next => { selection?.onReset(); setFilters(next); setPage(1); }} />}
      {status === 'EMITIDA' && <div className="nfse-issued-utility">
        {selection && rows.length > 0 && <label className="nfse-issued-page-selection"><input type="checkbox" aria-label="Selecionar todas as notas desta página"
        checked={allSelected} ref={node => { if (node) node.indeterminate = someSelected && !allSelected; }} disabled={!available || selection.disabled || !selectableRows.length}
        onChange={event => selection.onTogglePage(selectableRows, event.target.checked)} />Selecionar página</label>}
        <span className="nfse-inline-help">{data ? `${data.totalItems} registro(s)` : 'Registros do período'}</span>
        <div className="nfse-issued-utility-actions">{actions}{selectionActions?.(rows.filter(item => selection?.ids.has(item.id)), available)}</div>
      </div>}
      {status === 'EMITIDA' && query.error && <p className="nfse-issued-filter-hint" role="alert">Não foi possível atualizar esta consulta. Corrija os filtros e tente novamente.{data ? ' Exibindo a última lista carregada neste estabelecimento e ambiente.' : ''}
        <button type="button" className="nfse-button nfse-button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Tentar novamente</button></p>}
      {invalidDates ? <p className="nfse-download-error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>
        : rows.length ? status === 'EMITIDA' ? <NfseIssuedRows rows={rows} available={available} disabled={Boolean(selection?.disabled)} selected={selection?.ids}
          onToggle={selection?.onToggle} actions={documentActions} />
        : <div className="nfse-table-wrap"><table className="nfse-table">
        <thead><tr>{selection && <th className="nfse-issued-check"><input type="checkbox" aria-label={status === 'ERRO' ? 'Selecionar erros desta página' : 'Selecionar todas as notas desta página'}
          checked={allSelected} ref={node => { if (node) node.indeterminate = someSelected && !allSelected; }}
          disabled={!available || selection.disabled || !selectableRows.length}
          onChange={event => selection.onTogglePage(selectableRows, event.target.checked)} /></th>}
          <th>Aluno ou parceiro / turma</th><th>Modelo</th><th>Valor do serviço</th><th>Situação</th><th>{status === 'ERRO' ? 'Motivo e correção' : 'Nota fiscal'}</th><th>Ações</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}>
          {selection && <td><input type="checkbox" aria-label={status === 'ERRO' ? `Selecionar erro de ${item.studentName}` : `Selecionar nota ${item.number ?? ''} de ${item.studentName}`}
            checked={selection.ids.has(item.id)} disabled={!available || selection.disabled || !selectableRows.includes(item)}
            onChange={event => selection.onToggle(item, event.target.checked)} /></td>}
          <td>{item.studentName}<small>{item.classLabel}</small></td><td>{item.modelLabel}</td><td className="nfse-amount">{formatNfseMoney(item.amount)}</td>
          <td><span className="nfse-status" data-tone={item.state === 'CANCELLED' ? 'warning' : item.status === 'EMITIDA' ? 'success' : item.status === 'ERRO' ? 'error' : 'warning'}>{item.state ? operationLabel(item.state) : labels[item.status]}</span>
            {item.state === 'CANCELLED' && <small>Autorização histórica preservada; cancelamento confirmado.</small>}
            {item.archivedAt && <small>Arquivado · histórico preservado</small>}
            {item.message && <small>{item.message}</small>}</td>
          <td>{status === 'ERRO' ? <div className="nfse-error-detail">{item.errorCode && <strong>{item.errorCode} · </strong>}{item.errorMessage || 'Consulte o retorno fiscal antes de tentar novamente.'}<small>{item.retryable ? 'Pode ser reprocessada após correção.' : 'Requer conferência antes de nova tentativa.'}</small></div> : <>{item.number || 'Ainda não emitida'}{item.accessKey && <small className="break-all">Chave: {item.accessKey}</small>}{item.status === 'AGUARDANDO_CONFIRMACAO' && <small>Aguardando a consulta de confirmação para evitar duplicidade.</small>}</>}</td>
          <td>{documentActions?.(item, available)}{operationActions ? operationActions(item, available) : <NfseDocumentOperationAction document={item} disabled={!available} />}</td>
        </tr>)}</tbody>
      </table></div> : <NfseDataState loading={loading || (canRead && query.isPending)} unavailable={unavailable} error={query.error} onRetry={() => void query.refetch()} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />}
      {!query.error && query.data && <NfsePager page={query.data.page} hasNext={query.data.page * query.data.pageSize < query.data.totalItems} busy={query.isFetching || selection?.disabled} onChange={next => { selection?.onReset(); setPage(next); }} />}
      {status !== 'EMITIDA' && <div className="nfse-footer"><p>Consulte a operação vinculada antes de qualquer nova tentativa. As notas já autorizadas são preservadas.</p></div>}
    </section>
  );
}

