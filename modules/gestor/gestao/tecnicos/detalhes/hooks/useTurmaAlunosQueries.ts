import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AcademicStudent, academicLifecycleService } from '../academic-lifecycle.service';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { turmaAlunosService } from '../turma-alunos.service';

export const useTurmaStudents = (turmaId: string) => useQuery({
  queryKey: academicLifecycleKeys.alunos(turmaId),
  queryFn: () => academicLifecycleService.getStudents(turmaId),
  staleTime: 15_000,
});

export const useAvailableStudents = (
  turmaId: string,
  students: AcademicStudent[],
  enabled: boolean,
  searchTerm: string,
) => {
  const enrolledIds = useMemo(
    () => new Set(students.map((student) => student.aluno_id)),
    [students],
  );

  const query = useQuery({
    queryKey: academicLifecycleKeys.alunosDisponiveis(turmaId),
    queryFn: () => turmaAlunosService.getAvailableStudents(enrolledIds),
    enabled,
  });

  const filteredAvailableStudents = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!search) return query.data || [];

    return (query.data || []).filter((student) =>
      student.nome.toLocaleLowerCase('pt-BR').includes(search)
      || student.cpf_cnpj?.includes(searchTerm.trim())
    );
  }, [query.data, searchTerm]);

  return {
    ...query,
    filteredAvailableStudents,
  };
};

export const useTurmaFinanceiroMatriculaConfig = (turmaId: string, enabled: boolean) => useQuery({
  queryKey: academicLifecycleKeys.financeiroMatriculaConfig(turmaId),
  queryFn: () => turmaAlunosService.getFinanceiroMatriculaConfig(turmaId),
  enabled,
  staleTime: 30_000,
});

export const useDestinationClasses = (
  turmaId: string,
  enabled: boolean,
) => useQuery({
  queryKey: academicLifecycleKeys.turmasDestino(turmaId),
  queryFn: () => academicLifecycleService.getTurmasDestino(turmaId),
  enabled,
});
