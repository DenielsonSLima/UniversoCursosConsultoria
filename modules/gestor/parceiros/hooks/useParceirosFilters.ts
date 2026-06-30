import { useMemo, useState } from 'react';
import type { AlunoModalidadeFilter } from '../components/ParceirosFilters';

export type ParceirosTabType = 'todos' | 'professores' | 'alunos' | 'pj' | 'pf';

const expectedTipoByTab: Record<ParceirosTabType, string> = {
  todos: '',
  professores: 'Professor',
  alunos: 'Aluno',
  pj: 'PJ',
  pf: 'PF',
};

export const useParceirosFilters = (allPartners: any[], activeTab: ParceirosTabType) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [alunoModalidadeFilter, setAlunoModalidadeFilter] = useState<AlunoModalidadeFilter[]>([]);
  const [turmaFilter, setTurmaFilter] = useState('todas');
  const [sortOrder, setSortOrder] = useState('az');

  const toggleAlunoModalidadeFilter = (modalidade: AlunoModalidadeFilter) => {
    setAlunoModalidadeFilter((current) => (
      current.includes(modalidade)
        ? current.filter((item) => item !== modalidade)
        : [...current, modalidade]
    ));
  };

  const filteredPartners = useMemo(() => {
    return allPartners.filter(item => {
      const expectedTipo = expectedTipoByTab[activeTab];
      if (expectedTipo && item.tipo !== expectedTipo) return false;

      if (statusFilter !== 'todos' && item.status?.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        const contentStr = `${item.nome} ${item.cpf || ''} ${item.cnpj || ''} ${item.cidade || ''}`.toLowerCase();
        if (!contentStr.includes(lowerTerm)) return false;
      }

      if (alunoModalidadeFilter.length > 0) {
        if (item.tipo !== 'Aluno') return false;
        const modalidadesAluno = Array.isArray(item.modalidadesAluno) ? item.modalidadesAluno : [];
        const matchesAlunoModalidade = alunoModalidadeFilter.some((modalidade) => (
          modalidadesAluno.includes(modalidade)
        ));
        if (!matchesAlunoModalidade) return false;
      }

      if (turmaFilter !== 'todas') {
        if (item.tipo !== 'Aluno' && item.tipo !== 'Professor') return false;
        const turmasAlunoIds = Array.isArray(item.turmasAlunoIds) ? item.turmasAlunoIds : [];
        if (item.turmaId !== turmaFilter && !turmasAlunoIds.includes(turmaFilter)) return false;
      }

      return true;
    });
  }, [allPartners, activeTab, searchTerm, statusFilter, alunoModalidadeFilter, turmaFilter]);

  const sortedAndFilteredPartners = useMemo(() => {
    const sorted = [...filteredPartners];
    if (sortOrder === 'az') {
      sorted.sort((a, b) => a.nome.localeCompare(b.nome));
    } else if (sortOrder === 'za') {
      sorted.sort((a, b) => b.nome.localeCompare(a.nome));
    } else if (sortOrder === 'recent') {
      sorted.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
    } else if (sortOrder === 'oldest') {
      sorted.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    }
    return sorted;
  }, [filteredPartners, sortOrder]);

  const kpis = useMemo(() => {
    const totalParceiros = filteredPartners.length;
    const totalParceirosAtivos = filteredPartners.filter(p => p.status?.toLowerCase() === 'ativo').length;

    const alunos = filteredPartners.filter(p => p.tipo === 'Aluno');
    const totalAlunosVinculados = alunos.length;
    const totalAlunosAtivos = alunos.filter(p => p.status?.toLowerCase() === 'ativo').length;
    const totalAlunosInativos = alunos.filter(p => ['inativo', 'cancelado', 'desistente'].includes(p.status?.toLowerCase() || '')).length;

    const professores = filteredPartners.filter(p => p.tipo === 'Professor');
    const totalProfessoresVinculados = professores.length;
    const totalProfessoresAtivos = professores.filter(p => p.status?.toLowerCase() === 'ativo').length;
    const totalProfessoresInativos = professores.filter(p => p.status?.toLowerCase() === 'inativo').length;

    return {
      totalParceiros,
      totalParceirosAtivos,
      totalAlunosVinculados,
      totalAlunosAtivos,
      totalAlunosInativos,
      totalProfessoresVinculados,
      totalProfessoresAtivos,
      totalProfessoresInativos
    };
  }, [filteredPartners]);

  return {
    searchTerm,
    statusFilter,
    alunoModalidadeFilter,
    turmaFilter,
    setStatusFilter,
    toggleAlunoModalidadeFilter,
    clearAlunoModalidadeFilter: () => setAlunoModalidadeFilter([]),
    setTurmaFilter,
    handleSearch: setSearchTerm,
    handleSort: setSortOrder,
    sortedAndFilteredPartners,
    kpis,
  };
};
