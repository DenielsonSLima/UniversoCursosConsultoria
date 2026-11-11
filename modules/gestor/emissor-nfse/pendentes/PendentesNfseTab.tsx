import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Play, Trash2 } from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import NfsePager from '../components/NfsePager';
import { formatNfseMoney } from '../components/nfse.presentation';
import { useNfseQueue, useRemoveNfseQueue } from '../fila/useNfseQueue';
import { createNfseQueueRemovalAttempt } from '../fila/nfse-queue-removal';
import { NfseUnavailableError } from '../services/nfse.errors';
import { formatNfseMonth } from '../preparar/nfse-month.presentation';
import { nfseQueueBlockingLabel } from '../fila/nfse-queue.presentation';
import './nfse-queue-selection.css';
import NfseSourceEmissionModal from '../emissao/NfseSourceEmissionModal';
import { operationLabel } from '../emissao/nfse-operation.contract';
import type { NfseQueueRow } from '../fila/nfse-queue.types';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateNfseCache } from '../queries/nfse-cache';
import NfseBatchEmissionModal from '../emissao/NfseBatchEmissionModal';

const NfseFiscalReviewModal = lazy(() => import('../fila/fiscal-review/NfseFiscalReviewModal'));

export default function PendentesNfseTab() {
  const { scope } = useNfseTabContext();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [emission, setEmission] = useState<NfseQueueRow | null>(null);
  const [batch, setBatch] = useState<NfseQueueRow[] | null>(null);
  const query = useNfseQueue(scope, page);
  const remove = useRemoveNfseQueue(scope);
  const attempt = useRef(createNfseQueueRemovalAttempt());
  const submitting = useRef(false);
  const { toasts, removeToast, toast } = useToast();
  const data = query.error ? undefined : query.data;
  const visibleIds = data?.rows.map(item => item.id) ?? [];
  const selectedIds = selected.filter(id => visibleIds.includes(id));
  const removableIds = selectedIds.filter(id => data?.rows.some(row => row.id === id && !row.operationId));
  const allSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length;
  const busy = remove.isPending;

  useEffect(() => {
    if (!data) return;
    setSelected(ids => ids.filter(id => data.rows.some(row => row.id === id)));
    const lastPage = Math.max(1, Math.ceil(data.totalItems / data.pageSize));
    if (page > lastPage) { setPage(lastPage); setSelected([]); }
  }, [data, page]);

  const confirmRemoval = async () => {
    if (!scope || !confirmation?.length || submitting.current) return;
    submitting.current = true;
    try {
      const { result } = await remove.mutateAsync(attempt.current(scope, confirmation));
      setSelected([]);
      toast.success('Preparações excluídas', result.message);
    } catch (error) {
      toast.error('Exclusão não confirmada', error instanceof Error ? error.message : 'Revise a seleção e tente novamente.');
    } finally { submitting.current = false; }
  };

  return <section className="nfse-panel" aria-label="Pendentes de emissão" aria-busy={busy}>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="nfse-section-heading">
      <div><h2>Pendentes de emissão</h2><p>Recebimentos reservados e dados preservados para a conferência fiscal.</p></div>
      <div className="nfse-queue-actions">
        <button type="button" className="nfse-button nfse-button-danger" disabled={!scope || !removableIds.length || busy || query.isFetching}
          onClick={() => setConfirmation([...removableIds])}><Trash2 size={15} />{busy ? 'Excluindo…' : `Excluir selecionados${removableIds.length ? ` (${removableIds.length})` : ''}`}</button>
        <button type="button" className="nfse-button nfse-button-primary" disabled={!selectedIds.length || busy || query.isFetching}
          onClick={() => selectedIds.length === 1 ? setEmission(data?.rows.find(row => row.id === selectedIds[0]) || null)
            : setBatch(data?.rows.filter(row => selectedIds.includes(row.id)) || [])}><Play size={15} />{selectedIds.length > 1 ? `Revisar lote (${selectedIds.length})` : 'Emitir / consultar nota'}</button>
      </div>
    </header>
    {data?.rows.length ? <>
      <div className="nfse-queue-selection" aria-live="polite">
        <span>{selectedIds.length} selecionado(s) nesta página</span>
        {selectedIds.length > 0 && <button type="button" className="nfse-button nfse-button-secondary" disabled={busy}
          onClick={() => setSelected([])}>Limpar seleção</button>}
      </div>
      <div className="nfse-table-wrap"><table className="nfse-table">
        <thead><tr><th className="nfse-selection-cell"><input type="checkbox" aria-label="Selecionar todos desta página"
          checked={allSelected} ref={element => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected; }}
          disabled={busy || query.isFetching} onChange={() => setSelected(allSelected ? [] : visibleIds)} /></th>
          <th>Aluno / turma</th><th>Modelo</th><th>Recebimentos</th><th>Valor do serviço</th><th>Situação</th><th>Conferência fiscal</th></tr></thead>
        <tbody>{data.rows.map(item => <tr key={item.id} data-selected={selectedIds.includes(item.id)}>
          <td className="nfse-selection-cell"><input type="checkbox" aria-label={`Selecionar preparação de ${item.studentName}, ${item.classLabel}`}
            checked={selectedIds.includes(item.id)} disabled={busy || query.isFetching}
            onChange={() => setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id])} /></td>
          <td>{item.studentName}<small>{item.classLabel}</small></td>
          <td>{item.modelLabel}</td>
          <td>{item.receiptCount} recebimento(s)<small>{formatNfseMonth(item.paymentMonth)}</small></td>
          <td className="nfse-amount">{formatNfseMoney(item.amount)}</td>
          <td><span className="nfse-status" data-tone="warning">{operationLabel(item.state)}</span>{item.number && <small>NFS-e {item.number}</small>}
            {!item.operationId && item.blockingReasons.map(reason => <small key={reason}>{nfseQueueBlockingLabel(reason)}</small>)}</td>
          <td><button type="button" className="nfse-button nfse-button-secondary" disabled={busy || query.isFetching || Boolean(item.operationId)}
            aria-label={`Revisar dados fiscais de ${item.studentName}`} onClick={() => setReviewId(item.id)}>
            <ClipboardCheck size={15} />Revisar</button>
            <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || query.isFetching}
              onClick={() => setEmission(item)}>{item.operationId ? 'Consultar NFS-e' : 'Revisar e emitir'}</button></td>
        </tr>)}</tbody>
      </table></div>
      <footer className="nfse-footer"><span>{data.totalItems} documento(s)</span><span>Total preparado: <strong>{formatNfseMoney(data.totalAmount)}</strong></span></footer>
    </> : <NfseDataState loading={Boolean(scope && query.isPending)} unavailable={!scope || query.error instanceof NfseUnavailableError}
      error={query.error} onRetry={() => void query.refetch()} emptyTitle="Nenhuma nota pendente"
      emptyDescription="Adicione os alunos e confirme a preparação para reservar os recebimentos." />}
    {data && (page > 1 || data.totalItems > data.pageSize) && <NfsePager page={page} busy={busy || query.isFetching}
      hasNext={page * data.pageSize < data.totalItems} onChange={next => { setSelected([]); setConfirmation(null); setPage(next); }} />}
    <div className="nfse-footer"><p>A preparação não emite nota. Excluir da fila preserva os recebimentos e o histórico, sem cancelar NFS-e.</p></div>
    {reviewId && scope && <Suspense fallback={<p className="nfse-footer" role="status">Abrindo revisão fiscal…</p>}>
      <NfseFiscalReviewModal key={reviewId} scope={scope} documentId={reviewId} onClose={() => setReviewId(null)}
        onSaved={message => toast.success('Revisão fiscal salva', message)} />
    </Suspense>}
    {emission && scope && <NfseSourceEmissionModal scope={scope} source={{ kind: 'ACADEMIC_QUEUE', id: emission.id }}
      label={emission.studentName} amount={emission.amount} operation={emission} onClose={() => setEmission(null)}
      onNotice={notice => toast[notice.type](notice.title, notice.message)} onChanged={() => {
        void invalidateNfseCache(client, scope, 'operations');
      }} />}
    {batch && scope && <NfseBatchEmissionModal scope={scope} items={batch.map(row => ({ source: { kind: 'ACADEMIC_QUEUE', id: row.id }, label: row.studentName, amount: row.amount, operation: row }))}
      onClose={() => setBatch(null)} onNotice={notice => toast[notice.type](notice.title, notice.message)}
      onChanged={() => { void invalidateNfseCache(client, scope, 'operations'); }} />}
    <ConfirmModal isOpen={Boolean(confirmation)} onClose={() => setConfirmation(null)} onConfirm={() => void confirmRemoval()}
      title="Excluir preparações?" confirmText="Excluir da fila" cancelText="Voltar"
      message={`Excluir ${confirmation?.length ?? 0} preparação(ões) selecionada(s) desta fila? Os recebimentos serão preservados e poderão ser preparados novamente. O histórico será mantido. Esta ação não cancela nem exclui notas fiscais emitidas.`} />
  </section>;
}
