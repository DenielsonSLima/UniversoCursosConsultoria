import React, { useMemo } from 'react';
import type { RenegociacaoCandidateGroup, RenegociacaoCandidatePage } from '../renegociacoes.types';
import { EmptyPanel, ErrorPanel, LoadingPanel, Pagination } from './RenegociacaoPanels';
import CandidateStudentCard from './CandidateStudentCard';

interface CandidateGroupsProps {
  data?: RenegociacaoCandidatePage;
  loading: boolean;
  error: unknown;
  search: string;
  onRetry: () => void;
  onStart: (group: RenegociacaoCandidateGroup, selectedIds: string[]) => void;
  onPage: (page: number) => void;
}

const CandidateGroups: React.FC<CandidateGroupsProps> = ({
  data,
  loading,
  error,
  search,
  onRetry,
  onStart,
  onPage,
}) => {
  const students = useMemo(() => {
    const result = new Map<string, { name: string; groups: RenegociacaoCandidateGroup[] }>();
    for (const group of data?.groups || []) {
      const entry = result.get(group.alunoId) || { name: group.alunoNome, groups: [] };
      entry.groups.push(group);
      result.set(group.alunoId, entry);
    }
    return [...result.entries()];
  }, [data?.groups]);

  if (loading) return <LoadingPanel label="Carregando alunos e parcelas abertas..." />;
  if (error) return <ErrorPanel error={error} onRetry={onRetry} />;
  if (!students.length)
    return (
      <EmptyPanel
        title="Nenhuma parcela aberta"
        description={
          search
            ? 'Nenhuma parcela aberta corresponde aos filtros atuais.'
            : 'Nenhuma parcela aberta corresponde aos filtros atuais neste polo.'
        }
      />
    );

  return (
    <div className="space-y-4">
      {students.map(([studentId, student]) => (
        <CandidateStudentCard
          key={studentId}
          studentId={studentId}
          studentName={student.name}
          groups={student.groups}
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
    </div>
  );
};

export default CandidateGroups;
