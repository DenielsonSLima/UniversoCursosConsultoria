import React, { useEffect, useMemo, useState } from 'react';
import { ListPlus, UserPlus } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { useNfseTabContext } from '../components/NfseTabContext';
import { formatNfseMoney } from '../components/nfse.presentation';
import { getNfseCurrentMonth } from '../types/nfse.scope';
import { useNfseReceiptGroups, useNfseReceiptSelection } from './hooks/useNfseReceiptStudents';
import { useNfseReceiptRealtime } from './realtime/useNfseReceiptRealtime';
import { isNfseReceiptScopeValid } from './services/nfse-students.contract';
import { defaultNfseReceiptFilters, NFSE_STUDENT_SELECTION_LIMIT, type NfseReceiptFilters } from './types/nfse-students.types';
import NfseStudentsModal from './NfseStudentsModal';
import NfseStudentGroups from './NfseStudentGroups';

export default function PrepararNfseTab() {
  const { scope, workspace } = useNfseTabContext();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ month: getNfseCurrentMonth(), ids: [] as string[] });
  const [month, setMonth] = useState(getNfseCurrentMonth);
  const [ids, setIds] = useState<string[]>([]);
  const [filters, setFilters] = useState(defaultNfseReceiptFilters);
  const [search, setSearch] = useState('');
  const [modelId, setModelId] = useState('');
  const [limitError, setLimitError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setFilters(current => ({ ...current, search: search.trim(), page: 1 })), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const receiptScope = useMemo(() => scope ? {
    contextId: scope.contextKey, poloId: scope.poloId, paymentMonth: open ? month : draft.month,
  } : null, [scope, open, month, draft.month]);
  const validScope = isNfseReceiptScopeValid(receiptScope);
  const selectedIds = open ? ids : draft.ids;
  const draftScope = useMemo(() => scope ? { contextId: scope.contextKey, poloId: scope.poloId, paymentMonth: draft.month } : null, [scope, draft.month]);
  const draftQuery = useNfseReceiptSelection(draftScope, draft.ids, draft.ids.length > 0);
  const draftSelection = draftQuery.error ? undefined : draftQuery.data?.selection;
  const draftLoading = draftQuery.isPending || draftQuery.isFetching;
  const draftError = draftQuery.error ? 'Não foi possível atualizar a seleção.' : draftSelection && !draftSelection.valid ? 'Há recebimentos alterados. Limpe ou revise a seleção.' : null;
  const groupsQuery = useNfseReceiptGroups(receiptScope, filters, open);
  const selectionQuery = useNfseReceiptSelection(receiptScope, selectedIds, open);
  useNfseReceiptRealtime(receiptScope, open || draft.ids.length > 0);
  const selection = selectionQuery.error ? undefined : selectionQuery.data?.selection;
  const groups = groupsQuery.error ? undefined : groupsQuery.data;
  const selectionLoading = validScope && (selectionQuery.isPending || selectionQuery.isFetching);
  const filtersUpdating = search.trim() !== filters.search;
  const selectionError = limitError || (selectionQuery.error ? 'Não foi possível atualizar o total. Tente novamente.'
    : selection && !selection.valid ? 'Há recebimentos alterados. Remova os alunos indisponíveis ou refaça a seleção.' : null);
  const changeFilters = (patch: Partial<NfseReceiptFilters>) => setFilters(current => ({ ...current, ...patch, page: 1 }));
  const toggleIds = (targets: string[]) => {
    const remove = targets.every(id => ids.includes(id));
    const next = remove ? ids.filter(id => !targets.includes(id)) : [...new Set([...ids, ...targets])];
    if (next.length > NFSE_STUDENT_SELECTION_LIMIT) {
      setLimitError('Selecione até 1.000 alunos por preparação.');
      return;
    }
    setLimitError(null);
    setIds(next);
  };
  const openStudents = (event: React.MouseEvent<React.ElementRef<'button'>>) => {
    event.currentTarget.focus();
    setMonth(draft.ids.length ? draft.month : getNfseCurrentMonth());
    setIds(draft.ids);
    setFilters(defaultNfseReceiptFilters());
    setSearch('');
    setLimitError(null);
    setOpen(true);
  };
  const canAdd = Boolean(validScope && selection?.valid && selection.selectedCount > 0
    && !selectionLoading && !selectionError && !filtersUpdating);
  const removeDraft = (targets: string[]) => setDraft(current => ({
    ...current, ids: current.ids.filter(id => !targets.includes(id)),
  }));

  return <section className="nfse-panel" aria-label="Preparar emissão de notas">
    <div className="nfse-section-heading">
      <div><h2>Alunos selecionados</h2>{draft.ids.length > 0 && <p>Recebimentos de {draft.month.split('-').reverse().join('/')}</p>}</div>
      <button type="button" className="nfse-button nfse-button-primary" onClick={openStudents} disabled={!validScope}><UserPlus size={16} />Adicionar alunos</button>
    </div>
    {draft.ids.length > 0 ? <>
      <div className="nfse-toolbar"><div className="nfse-field"><label htmlFor="nfse-model">Modelo de emissão</label>
        <InstitutionalSelect id="nfse-model" ariaLabel="Modelo de emissão" value={modelId} onValueChange={setModelId}
          options={(workspace?.models || []).filter(item => item.active).map(item => ({ value: item.id, label: item.name }))}
          placeholder="Selecionar modelo" disabled={!workspace?.capabilities.prepare} />
      </div><button type="button" className="nfse-button nfse-button-secondary" onClick={() => { setLimitError(null); setDraft(current => ({ ...current, ids: [] })); }}>Limpar seleção</button></div>
      {draftError ? <div className="nfse-footer" role="alert"><span>{draftError}</span>
        <button type="button" className="nfse-button nfse-button-secondary" onClick={() => void draftQuery.refetch()}>Atualizar</button>
      </div> : null}
      {draftSelection?.groups && <NfseStudentGroups groups={draftSelection.groups} selectedIds={draft.ids}
        disabled={draftLoading} onToggleStudent={id => removeDraft([id])} onToggleGroup={removeDraft} />}
      <div className="nfse-footer">
        <span aria-live="polite">Total selecionado: <strong>{draftLoading ? 'Atualizando…' : !draftQuery.error && draftSelection?.valid ? formatNfseMoney(draftSelection.selectedAmount) : '—'}</strong></span>
        <button type="button" className="nfse-button nfse-button-secondary" disabled title="A preparação fiscal ainda não está habilitada"><ListPlus size={16} />Adicionar aos pendentes</button>
      </div>
    </> : <div className="nfse-empty"><UserPlus size={26} /><strong>Nenhum aluno selecionado</strong></div>}
    {open && <NfseStudentsModal
      month={month} search={search} courseTypeId={filters.courseType} classId={filters.classId}
      courseTypes={[{ value: '', label: 'Todos os tipos' }, ...(groups?.courseTypes || [{ id: 'TECNICO', label: 'Técnico' }]).map(item => ({ value: item.id, label: item.label }))]}
      classes={(groups?.classes || []).map(item => ({ value: item.id, label: item.label }))}
      groups={groups?.groups || []} selectedIds={ids} selectedCount={selection?.selectedCount ?? 0}
      selectedAmount={selection?.selectedAmount ?? null} selectionLoading={selectionLoading}
      selectionError={selectionError} canAdd={canAdd}
      excludedUnknownCount={groups?.excludedUnknownCount}
      loading={validScope && groupsQuery.isPending} refreshing={groupsQuery.isFetching || filtersUpdating}
      error={!validScope ? 'Informe um mês de referência válido.' : groupsQuery.error ? 'Não foi possível consultar os recebimentos.' : null}
      page={filters.page} hasNext={Boolean(groups && groups.page * groups.pageSize < groups.totalGroups)}
      onPageChange={page => setFilters(current => ({ ...current, page }))}
      onMonthChange={value => { setMonth(value); setIds([]); setLimitError(null); changeFilters({ classId: '' }); }}
      onSearchChange={setSearch} onCourseTypeChange={courseType => changeFilters({ courseType, classId: '' })}
      onClassChange={classId => changeFilters({ classId })}
      onToggleStudent={id => toggleIds([id])} onToggleGroup={toggleIds} onToggleAll={toggleIds}
      onRetry={() => { void groupsQuery.refetch(); void selectionQuery.refetch(); }}
      onClearSelection={() => { setIds([]); setLimitError(null); }}
      onClose={() => { setOpen(false); setLimitError(null); }} onAdd={() => {
        if (!canAdd || !selection) return;
        setDraft({ month, ids: selection.ids });
        setOpen(false);
      }}
    />}
  </section>;
}
