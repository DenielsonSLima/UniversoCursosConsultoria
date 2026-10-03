import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, CircleAlert, GraduationCap, ReceiptText } from 'lucide-react';
import { useRenegociacaoCandidateItems } from '../hooks/useRenegociacoesQueries';
import { formatCents, formatRenegociacaoDate } from '../renegociacoes.model';
import type { RenegociacaoCandidateGroup, RenegociacaoCourseType } from '../renegociacoes.types';
import { ErrorPanel, LoadingPanel } from './RenegociacaoPanels';
import { SelectionStep } from './WizardSteps';
import {
  allEligibleCandidatesSelected,
  candidateIdentityMatchesGroup,
  eligibleCandidateIds,
  reconcileCandidateSelection,
  toggleAllEligibleCandidates,
  toggleCandidateSelection,
} from './candidateSelection.model';

interface CandidateEnrollmentProps {
  group: RenegociacaoCandidateGroup;
  active: boolean;
  onStart: (group: RenegociacaoCandidateGroup, selectedIds: string[]) => void;
}

const optionalNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const courseTypeLabel: Record<RenegociacaoCourseType, string> = {
  TECNICO: 'Técnico',
  LIVRE: 'Curso livre',
  ESPECIALIZACAO: 'Especialização',
  EAD: 'EAD',
};

const CandidateEnrollment: React.FC<CandidateEnrollmentProps> = ({ group, active, onStart }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const requestMatriculaId = active && expanded ? group.matriculaId : null;
  const itemsQuery = useRenegociacaoCandidateItems(requestMatriculaId);
  const panelId = `candidate-enrollment-${group.matriculaId}`;
  const summary = group as unknown as Record<string, unknown>;
  const openCount = optionalNumber(summary.openCount) ?? group.overdueCount + group.futureCount;
  const courseType = group.courseType ? courseTypeLabel[group.courseType] : null;
  const reportedEligibleCount = optionalNumber(group.eligibleCount);
  const identityMatches = Boolean(
    itemsQuery.data && candidateIdentityMatchesGroup(group, itemsQuery.data.identity),
  );
  const items = useMemo(
    () => (identityMatches ? itemsQuery.data?.items || [] : []),
    [identityMatches, itemsQuery.data],
  );
  const eligibleIds = useMemo(() => eligibleCandidateIds(items), [items]);
  const eligibleIdSet = useMemo(() => new Set(eligibleIds), [eligibleIds]);
  const allSelected = allEligibleCandidatesSelected(selectedIds, items);

  useEffect(() => {
    if (!requestMatriculaId || !itemsQuery.data) return;
    if (!identityMatches) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => reconcileCandidateSelection(current, itemsQuery.data.items));
  }, [identityMatches, itemsQuery.data, requestMatriculaId]);

  const canStart = Boolean(
    !itemsQuery.isPending &&
      !itemsQuery.isError &&
      identityMatches &&
      itemsQuery.data?.policyDefaults &&
      selectedIds.length > 0 &&
      selectedIds.every((id) => eligibleIdSet.has(id)),
  );
  const startProposal = () => {
    const safeSelection = reconcileCandidateSelection(selectedIds, items);
    if (!canStart || !safeSelection.length) return;
    onStart(group, safeSelection);
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <GraduationCap size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm text-[#001a33]">{group.turmaNome}</strong>
            {group.matriculaCodigo ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">
                Matrícula {group.matriculaCodigo}
              </span>
            ) : null}
            {courseType ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">
                {courseType}
              </span>
            ) : null}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
            <span>{openCount} {openCount === 1 ? 'parcela aberta' : 'parcelas abertas'}</span>
            <span>{group.overdueCount} em atraso</span>
            <span>{group.futureCount} a vencer</span>
            <span>Principal {formatCents(group.principalCents)}</span>
          </span>
          <span className="mt-1 block text-[10px] font-medium text-slate-400">
            {summary.eligibilityPending === true || reportedEligibleCount == null
              ? 'Elegibilidade conferida ao abrir as parcelas'
              : `${reportedEligibleCount} elegível(is) na última conferência`}
            {group.oldestDueDate ? ` • Mais antiga: ${formatRenegociacaoDate(group.oldestDueDate)}` : ''}
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div id={panelId} hidden={!expanded} className="border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4">
        {expanded && itemsQuery.isPending ? (
          <LoadingPanel label="Conferindo parcelas desta matrícula..." />
        ) : null}
        {expanded && itemsQuery.isError ? (
          <ErrorPanel
            error={itemsQuery.error}
            onRetry={() => {
              void itemsQuery.refetch();
            }}
          />
        ) : null}
        {expanded && !itemsQuery.isPending && !itemsQuery.isError && itemsQuery.data && !identityMatches ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
            Os dados retornados não pertencem a este aluno, matrícula, turma e polo. Atualize a lista antes de continuar.
          </div>
        ) : null}
        {expanded && !itemsQuery.isPending && !itemsQuery.isError && identityMatches ? (
          <div className="space-y-4">
            <SelectionStep
              items={items}
              selected={selectedIds}
              allSelected={allSelected}
              onToggleAll={() => setSelectedIds((current) => toggleAllEligibleCandidates(current, items))}
              onToggle={(id) => setSelectedIds((current) => toggleCandidateSelection(current, id, items))}
            />
            {!itemsQuery.data?.policyDefaults ? (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                A regra financeira desta matrícula não pôde ser confirmada. Nenhuma proposta pode ser iniciada.
              </div>
            ) : null}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-xs font-bold text-slate-600" aria-live="polite">
                {selectedIds.length ? (
                  <ReceiptText size={15} className="text-blue-600" aria-hidden="true" />
                ) : eligibleIds.length ? (
                  <CalendarClock size={15} className="text-slate-400" aria-hidden="true" />
                ) : (
                  <CircleAlert size={15} className="text-amber-600" aria-hidden="true" />
                )}
                {selectedIds.length
                  ? `${selectedIds.length} ${selectedIds.length === 1 ? 'parcela selecionada' : 'parcelas selecionadas'}`
                  : eligibleIds.length
                    ? 'Selecione uma ou várias parcelas desta matrícula'
                    : 'Nenhuma parcela elegível nesta matrícula'}
              </p>
              <button
                type="button"
                disabled={!canStart}
                onClick={startProposal}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Continuar com {selectedIds.length || 0}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default CandidateEnrollment;
