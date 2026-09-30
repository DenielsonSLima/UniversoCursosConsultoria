import { useEffect, useMemo, useState } from 'react';
import type { AlunoModalidadeFilter } from '../components/ParceirosFilters';
import { filterParceiros, sortParceiros } from '../parceiros-filters.model';

export type ParceirosTabType = 'todos' | 'professores' | 'alunos' | 'responsaveis' | 'coordenacoes' | 'pj' | 'pf';

export const useParceirosFilters = (allPartners: any[], activeTab: ParceirosTabType) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [alunoModalidadeFilter, setAlunoModalidadeFilter] = useState<AlunoModalidadeFilter[]>([]);
  const [turmaFilter, setTurmaFilter] = useState('todas');
  const [sortOrder, setSortOrder] = useState('az');

  useEffect(() => {
    if (activeTab !== 'todos' && activeTab !== 'alunos') {
      setAlunoModalidadeFilter([]);
    }
    if (!['todos', 'alunos', 'professores'].includes(activeTab)) {
      setTurmaFilter('todas');
    }
  }, [activeTab]);

  const toggleAlunoModalidadeFilter = (modalidade: AlunoModalidadeFilter) => {
    setAlunoModalidadeFilter((current) => (
      current.includes(modalidade)
        ? current.filter((item) => item !== modalidade)
        : [...current, modalidade]
    ));
  };

  const filteredPartners = useMemo(() => {
    return filterParceiros(allPartners, {
      activeTab, searchTerm, statusFilter, alunoModalidadeFilter, turmaFilter,
    });
  }, [allPartners, activeTab, searchTerm, statusFilter, alunoModalidadeFilter, turmaFilter]);

  const sortedAndFilteredPartners = useMemo(() => {
    return sortParceiros(filteredPartners, sortOrder);
  }, [filteredPartners, sortOrder]);

  return {
    searchTerm,
    statusFilter,
    sortOrder,
    alunoModalidadeFilter,
    turmaFilter,
    setStatusFilter,
    toggleAlunoModalidadeFilter,
    clearAlunoModalidadeFilter: () => setAlunoModalidadeFilter([]),
    setTurmaFilter,
    handleSearch: setSearchTerm,
    handleSort: setSortOrder,
    sortedAndFilteredPartners,
  };
};
