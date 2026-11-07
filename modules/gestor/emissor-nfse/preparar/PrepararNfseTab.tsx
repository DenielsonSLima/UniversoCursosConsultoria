import React, { useDeferredValue, useRef, useState } from 'react';
import { ListPlus } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { useNfseCandidates } from '../hooks/useNfseQueries';
import { usePrepareNfseBatch } from '../hooks/useNfseMutations';
import { NFSE_WRITES_ENABLED } from '../services/nfse.runtime';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDataState from '../components/NfseDataState';
import NfsePager from '../components/NfsePager';
import { formatNfseMoney } from '../components/nfse.presentation';

export default function PrepararNfseTab() {
  const { scope, workspace, unavailable, canRead, loading, onPrepared } = useNfseTabContext();
  const [classId, setClassId] = useState('');
  const [modelId, setModelId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const { toasts, removeToast, toast } = useToast();
  const query = useNfseCandidates(canRead ? scope : null, { classId, modelId, search: deferredSearch, page });
  const prepare = usePrepareNfseBatch(scope, workspace?.capabilities);
  const rows = query.error ? [] : query.data?.rows || [];
  const allowed = Boolean(NFSE_WRITES_ENABLED && canRead && workspace?.capabilities.prepare && !query.error && deferredSearch === search.trim());
  const changeFilter = (change: () => void) => { change(); setPage(1); setSelection([]); };
  const toggle = (id: string) => setSelection((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const addToPending = async () => {
    if (!allowed || !modelId || !selection.length || prepare.isPending || query.isFetching) return;
    const fingerprint = JSON.stringify({ modelId, ids: [...selection].sort() });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await prepare.mutateAsync({ requestId: request.current.id, candidateIds: selection, modelId });
      setSelection([]);
      toast.success('Preparação confirmada', 'As notas foram adicionadas aos pendentes para conferência.');
      onPrepared();
    } catch {
      toast.error('Não foi possível preparar as notas', 'A preparação não foi confirmada. Confira a disponibilidade e tente novamente.');
    }
  };

  return (
    <section className="nfse-panel" aria-label="Preparar emissão de notas">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="nfse-section-heading"><div><h2>Recebimentos por turma e aluno</h2><p>Selecione o modelo e os recebimentos para conferir antes da emissão.</p></div></div>
      <div className="nfse-toolbar">
        <div className="nfse-field"><label htmlFor="nfse-class">Turma</label><InstitutionalSelect id="nfse-class" ariaLabel="Turma" value={classId} onValueChange={(value) => changeFilter(() => setClassId(value))} options={(workspace?.classes || []).map((item) => ({ value: item.id, label: item.label }))} placeholder="Todas as turmas" allowClear disabled={!canRead || prepare.isPending} /></div>
        <div className="nfse-field"><label htmlFor="nfse-model">Modelo de emissão</label><InstitutionalSelect id="nfse-model" ariaLabel="Modelo de emissão" value={modelId} onValueChange={(value) => changeFilter(() => setModelId(value))} options={(workspace?.models || []).filter((item) => item.active).map((item) => ({ value: item.id, label: item.name }))} placeholder="Selecionar modelo" required disabled={!canRead || prepare.isPending} /></div>
        <div className="nfse-field"><label htmlFor="nfse-student-search">Aluno</label><input id="nfse-student-search" type="search" placeholder="Buscar aluno…" value={search} disabled={!canRead || prepare.isPending} onChange={(event) => changeFilter(() => setSearch(event.target.value))} /></div>
      </div>
      {rows.length ? <div className="nfse-table-wrap"><table className="nfse-table">
        <thead><tr><th aria-label="Selecionar">Seleção</th><th>Turma / aluno</th><th>Recebido no mês</th><th>Valor do serviço</th><th>Situação</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}>
          <td><input type="checkbox" aria-label={`Selecionar ${item.studentName}`} checked={selection.includes(item.id)} disabled={!allowed || !item.eligible || prepare.isPending || query.isFetching} onChange={() => toggle(item.id)} /></td>
          <td>{item.studentName}<small>{item.classLabel}</small></td>
          <td className="nfse-amount">{formatNfseMoney(item.receivedAmount)}</td><td className="nfse-amount">{formatNfseMoney(item.serviceAmount)}</td>
          <td><span className="nfse-status" data-tone={item.eligible ? 'success' : 'warning'}>{item.eligible ? 'Apto para preparar' : 'Conferir'}</span>{item.blockingReason && <small>{item.blockingReason}</small>}</td>
        </tr>)}</tbody>
      </table></div> : <NfseDataState loading={loading || (canRead && query.isPending)} unavailable={unavailable} error={query.error} onRetry={() => void query.refetch()} emptyTitle="Nenhum recebimento disponível" emptyDescription="Os recebimentos confirmados e ainda disponíveis para preparação aparecerão nesta lista." />}
      {query.data && <NfsePager page={query.data.page} hasNext={query.data.page * query.data.pageSize < query.data.totalItems} busy={query.isFetching || prepare.isPending} onChange={(value) => { setPage(value); setSelection([]); }} />}
      <div className="nfse-footer"><span>{selection.length ? `${selection.length} registro(s) selecionado(s) nesta página` : 'Selecione os registros que deseja preparar.'}</span><button type="button" className="nfse-button nfse-button-primary" disabled={!allowed || !selection.length || !modelId || prepare.isPending || query.isFetching} onClick={() => void addToPending()}><ListPlus size={16} />{prepare.isPending ? 'Preparando…' : 'Adicionar aos pendentes'}</button></div>
      <div className="nfse-footer"><p>A competência da prestação será conferida na preparação. O mês acima filtra os recebimentos.</p></div>
    </section>
  );
}
