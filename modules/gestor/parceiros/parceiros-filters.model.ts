import { textMatchesSearch } from '../../../lib/search.ts';
import type { AlunoModalidadeFilter } from './components/ParceirosFilters';
import type { ParceirosTabType } from './hooks/useParceirosFilters';

const expectedTipoByTab: Record<ParceirosTabType, string> = {
  todos: '',
  professores: 'Professor',
  alunos: 'Aluno',
  responsaveis: '',
  coordenacoes: '',
  pj: 'PJ',
  pf: 'PF',
};

interface ParceirosFilterInput {
  activeTab: ParceirosTabType;
  searchTerm: string;
  statusFilter: string;
  alunoModalidadeFilter: AlunoModalidadeFilter[];
  turmaFilter: string;
}

export const filterParceiros = (items: any[], filters: ParceirosFilterInput) => items.filter((item) => {
  const expectedTipo = expectedTipoByTab[filters.activeTab];
  if (expectedTipo && item.tipo !== expectedTipo) return false;
  if (
    filters.statusFilter !== 'todos'
    && item.status?.toLowerCase() !== filters.statusFilter.toLowerCase()
  ) return false;

  if (filters.searchTerm && !textMatchesSearch(filters.searchTerm, [
    item.nome,
    item.cpf,
    item.cnpj,
    item.cidade,
    item.email,
    item.telefone,
  ])) return false;

  if (
    (filters.activeTab === 'todos' || filters.activeTab === 'alunos')
    && filters.alunoModalidadeFilter.length > 0
  ) {
    if (item.tipo !== 'Aluno') return false;
    const modalidades = Array.isArray(item.modalidadesAluno) ? item.modalidadesAluno : [];
    if (!filters.alunoModalidadeFilter.some((modalidade) => modalidades.includes(modalidade))) {
      return false;
    }
  }

  if (
    ['todos', 'alunos', 'professores'].includes(filters.activeTab)
    && filters.turmaFilter !== 'todas'
  ) {
    if (item.tipo !== 'Aluno' && item.tipo !== 'Professor') return false;
    const turmaIds = Array.isArray(item.turmasAlunoIds) ? item.turmasAlunoIds : [];
    if (item.turmaId !== filters.turmaFilter && !turmaIds.includes(filters.turmaFilter)) return false;
  }

  return true;
});

export const sortParceiros = (items: any[], sortOrder: string) => {
  const sorted = [...items];
  if (sortOrder === 'az') sorted.sort((a, b) => a.nome.localeCompare(b.nome));
  else if (sortOrder === 'za') sorted.sort((a, b) => b.nome.localeCompare(a.nome));
  else if (sortOrder === 'recent') sorted.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  else if (sortOrder === 'oldest') sorted.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  return sorted;
};
