import React, { useCallback, useMemo, useState } from 'react';
import type { RenegociacaoCandidateGroup, RenegociacaoCandidatePage } from '../renegociacoes.types';
import { EmptyPanel, ErrorPanel, LoadingPanel, Pagination } from './RenegociacaoPanels';
import CandidateStudentCard from './CandidateStudentCard';
import {
  candidateSelectionOwnedBy,
  emptyCandidateSelection,
  updateCandidateSelection,
} from './candidateSelection.model';

interface CandidateGroupsProps {
  data?: RenegociacaoCandidatePage;
  loading: boolean;
  error: unknown;
  search: string;
  onRetry: () => void;
  onStart: (group: RenegociacaoCandidateGroup, selectedIds: string[]) => void;
  onPage: (page: number) => void;
  selectionContextKey?: string;
}

type CandidateGroupsWorkspaceProps = Omit<CandidateGroupsProps, 'selectionContextKey'>;

const CandidateGroupsWorkspace: React.FC<CandidateGroupsWorkspaceProps> = ({
  data,
  loading,
  error,
  search,
  onRetry,
  onStart,
  onPage,
}) => {
  const [selection, setSelection] = useState(emptyCandidateSelection);
  const students = useMemo(() => {
    const result = new Map<string, { name: string; groups: RenegociacaoCandidateGroup[] }>();
    for (const group of data?.groups || []) {
      const entry = result.get(group.alunoId) || { name: group.alunoNome, groups: [] };
      entry.groups.push(group);
      result.set(group.alunoId, entry);
    }
    return [...result.entries()];
  }, [data?.groups]);
  const selectionOwnerVisible = Boolean(
    selection.ownerIdentity &&
      data?.groups.some((group) => candidateSelectionOwnedBy(selection, group)),
  );
  const updateSelection = useCallback((group: RenegociacaoCandidateGroup, selectedIds: string[]) => {
    setSelection((current) => updateCandidateSelection(current, group, selectedIds));
  }, []);
  const clearSelection = useCallback(() => setSelection(emptyCandidateSelection()), []);

  let content: React.ReactNode;
  if (loading) content = <LoadingPanel label="Carregando alunos e parcelas abertas..." />;
  else if (error) content = <ErrorPanel error={error} onRetry={onRetry} />;
  else if (!students.length)
    content = (
      <EmptyPanel
        title="Nenhuma parcela aberta"
        description={
          search
            ? 'Nenhuma parcela aberta corresponde aos filtros atuais.'
            : 'Nenhuma parcela aberta corresponde aos filtros atuais neste polo.'
        }
      />
    );
  else
    content = (
      <>
        {students.map(([studentId, student]) => (
          <CandidateStudentCard
            key={studentId}
            studentId={studentId}
            studentName={student.name}
            groups={student.groups}
            selection={selection}
            onSelectionChange={updateSelection}
            onClearSelection={clearSelection}
            onStart={onStart}
          />
        ))}
        {data ? (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={
              'totalStudents' in data && typeof data.totalStudents === 'number'
                ? data.totalStudents
                : data.totalGroups
            }
            onChange={onPage}
          />
        ) : null}
      </>
    );

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium leading-relaxed text-slate-500">
        Parcelas em aberto, vencidas ou a vencer, conforme os filtros. Ordem: mais parcelas em atraso,
        depois vencimento atrasado mais antigo e nome do aluno. A elegibilidade é conferida ao expandir a matrícula.
      </p>
      {selection.ownerIdentity && selection.selectedIds.length ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs font-bold text-blue-950">
            {selection.selectedIds.length}{' '}
            {selection.selectedIds.length === 1 ? 'parcela selecionada' : 'parcelas selecionadas'} em uma única
            matrícula.{' '}
            {selectionOwnerVisible
              ? 'Para escolher outro aluno ou turma, limpe esta seleção.'
              : 'A seleção está fora dos filtros ou da página atual; limpe-a para iniciar outra.'}
          </p>
          <button
            type="button"
            onClick={clearSelection}
            className="min-h-10 shrink-0 rounded-xl border border-blue-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Limpar seleção
          </button>
        </div>
      ) : null}
      {content}
    </div>
  );
};

const CandidateGroups: React.FC<CandidateGroupsProps> = ({ selectionContextKey = '', ...props }) => (
  <CandidateGroupsWorkspace key={selectionContextKey} {...props} />
);

export default CandidateGroups;
