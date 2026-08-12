import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../tecnicos/detalhes/academic-lifecycle.keys';
import { planoFinanceiroUnicoService } from '../presencial-financeiro-unico.service';

export const useAlunosDisponiveisPlanoFinanceiroUnico = (
  turmaId: string,
  enabled: boolean,
  searchTerm: string,
) => {
  const normalizedSearchTerm = searchTerm.trim();
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(normalizedSearchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [normalizedSearchTerm]);

  const hasSearch = debouncedSearchTerm.length >= 2;
  const isSearchSettling = normalizedSearchTerm.length >= 2
    && normalizedSearchTerm !== debouncedSearchTerm;
  const query = useQuery({
    queryKey: [...academicLifecycleKeys.alunosDisponiveis(turmaId), 'plano-unico', debouncedSearchTerm],
    queryFn: () => planoFinanceiroUnicoService.getAvailableStudents(turmaId, debouncedSearchTerm),
    enabled: enabled && hasSearch,
    staleTime: 30_000,
  });

  const filteredAvailableStudents = useMemo(() => {
    if (isSearchSettling) return [];
    const normalizedTerm = debouncedSearchTerm.toLocaleLowerCase('pt-BR');
    const searchDigits = debouncedSearchTerm.replace(/\D/g, '');
    if (!normalizedTerm) return [];

    return (query.data || []).filter((student) => {
      const document = String(student.cpf_cnpj || '').toLocaleLowerCase('pt-BR');
      const documentDigits = document.replace(/\D/g, '');
      const phoneDigits = String(student.telefone || '').replace(/\D/g, '');
      const responsiblePhoneDigits = String(student.responsavel_telefone || '').replace(/\D/g, '');

      return student.nome.toLocaleLowerCase('pt-BR').includes(normalizedTerm)
        || document.includes(normalizedTerm)
        || (searchDigits.length > 0 && (
          documentDigits.includes(searchDigits)
          || phoneDigits.includes(searchDigits)
          || responsiblePhoneDigits.includes(searchDigits)
        ));
    });
  }, [debouncedSearchTerm, isSearchSettling, query.data]);

  return { ...query, filteredAvailableStudents, isSearchSettling };
};
