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
  const hasSearch = searchTerm.trim().length > 0;
  const enrolledIds = useMemo(
    () => new Set(students.map((student) => student.aluno_id)),
    [students],
  );

  const query = useQuery({
    queryKey: academicLifecycleKeys.alunosDisponiveis(turmaId),
    queryFn: () => turmaAlunosService.getAvailableStudents(turmaId, enrolledIds),
    enabled: enabled && hasSearch,
  });

  const filteredAvailableStudents = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const searchDigits = searchTerm.replace(/\D/g, '');
    if (!search) return [];

    return (query.data || []).filter((student) => {
      const document = String(student.cpf_cnpj || '').toLocaleLowerCase('pt-BR');
      const documentDigits = document.replace(/\D/g, '');

      return student.nome.toLocaleLowerCase('pt-BR').includes(search)
        || document.includes(search)
        || (searchDigits.length > 0 && documentDigits.includes(searchDigits));
    });
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

export const usePrevisaoFinanceiraTurma = (turmaId: string, enabled: boolean) => useQuery({
  queryKey: ['previsao-financeira-turma', turmaId],
  queryFn: () => turmaAlunosService.preverGeracaoCobrancasFuturas(turmaId),
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
