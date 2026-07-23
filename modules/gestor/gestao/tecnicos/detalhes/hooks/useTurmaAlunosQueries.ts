import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AcademicStudent, academicLifecycleService } from '../academic-lifecycle.service';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { turmaAlunosService } from '../turma-alunos.service';
import { asaasIntegrationService } from '../../../../../asaas/asaas.service';

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
  const normalizedSearchTerm = searchTerm.trim();
  const hasSearch = normalizedSearchTerm.length > 0;
  const enrolledIds = useMemo(
    () => new Set(students.map((student) => student.aluno_id)),
    [students],
  );

  const query = useQuery({
    queryKey: [...academicLifecycleKeys.alunosDisponiveis(turmaId), normalizedSearchTerm],
    queryFn: () => turmaAlunosService.getAvailableStudents(turmaId, enrolledIds, normalizedSearchTerm),
    enabled: enabled && hasSearch,
  });

  const filteredAvailableStudents = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const searchDigits = searchTerm.replace(/\D/g, '');
    if (!search) return [];

    return (query.data || []).filter((student) => {
      const document = String(student.cpf_cnpj || '').toLocaleLowerCase('pt-BR');
      const documentDigits = document.replace(/\D/g, '');
      const phoneDigits = String(student.telefone || '').replace(/\D/g, '');
      const responsiblePhoneDigits = String(student.responsavel_telefone || '').replace(/\D/g, '');

      return student.nome.toLocaleLowerCase('pt-BR').includes(search)
        || document.includes(search)
        || (searchDigits.length > 0 && (
          documentDigits.includes(searchDigits)
          || phoneDigits.includes(searchDigits)
          || responsiblePhoneDigits.includes(searchDigits)
        ));
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

export const useEnrollmentPaymentOptions = (turmaId: string, enabled: boolean) => useQuery({
  queryKey: ['enrollment-payment-options', turmaId],
  queryFn: () => asaasIntegrationService.getEnrollmentPaymentOptions(turmaId),
  enabled,
  staleTime: 15_000,
});

export const useDestinationClasses = (
  turmaId: string,
  enabled: boolean,
) => useQuery({
  queryKey: academicLifecycleKeys.turmasDestino(turmaId),
  queryFn: () => academicLifecycleService.getTurmasDestino(turmaId),
  enabled,
});
