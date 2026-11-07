import { useEffect, useRef, useState } from 'react';
import { historicoEmissoesService as service } from './historico-emissoes.service';
import { PAGE_SIZE } from './historico-emissoes.constants';
import type { EmissionLog } from './historico-emissoes.types';

const initialQuery = { activeTab: 'todos', search: '', modalidade: 'todos',
  cursoId: 'todos', turmaId: 'todos', page: 1 };
type Query = typeof initialQuery;
type Filters = Awaited<ReturnType<typeof service.loadFilters>>;

export function useEmissionsListing(poloId: string, onError: (error: Error) => void) {
  const [query, setQuery] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ turmas: [], cursos: [], systemUsers: {} });
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emissions, setEmissions] = useState<EmissionLog[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(current => current.search === searchQuery.trim() ? current
        : { ...current, search: searchQuery.trim(), page: 1 });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    setFiltersLoading(true);
    setFiltersError('');
    setFilters({ turmas: [], cursos: [], systemUsers: {} });
    setQuery(initialQuery);
    setSearchQuery('');
    void service.loadFilters(poloId).then(result => {
      if (active) setFilters({ ...result, cursos: result.cursos || [] });
    }).catch((failure: Error) => {
      if (!active) return;
      setFiltersError('Não foi possível carregar os filtros.');
      errorRef.current(failure);
    }).finally(() => { if (active) setFiltersLoading(false); });
    return () => { active = false; };
  }, [poloId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void service.loadEmissions({ ...query, poloId }).then(result => {
      if (!active) return;
      setEmissions(result.emissions);
      setTotalRecords(result.total);
    }).catch((failure: Error) => {
      if (!active) return;
      setEmissions([]);
      setTotalRecords(0);
      setError('Não foi possível carregar o histórico com os filtros informados.');
      errorRef.current(failure);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [poloId, query, reloadVersion]);

  const changeFilter = (patch: Partial<Query>) => setQuery(current => ({
    ...current, ...patch, search: searchQuery.trim(), page: 1,
  }));
  const cursos = filters.cursos.filter(curso => query.modalidade === 'todos' || curso.modalidade === query.modalidade);
  const turmas = filters.turmas.filter(turma =>
    (query.modalidade === 'todos' || turma.modalidade === query.modalidade)
    && (query.cursoId === 'todos' || turma.cursoId === query.cursoId));
  const modalidades = [...new Set(filters.cursos.map(curso => curso.modalidade))].sort();

  return {
    setReloadVersion, error,
    toolbarProps: {
      activeTab: query.activeTab, searchQuery, selectedTurmaId: query.turmaId,
      selectedModalidade: query.modalidade, selectedCursoId: query.cursoId,
      turmas, cursos, modalidades, filtersLoading, filtersError,
      onTabChange: (activeTab: string) => changeFilter({ activeTab }),
      onSearchChange: setSearchQuery,
      onTurmaChange: (turmaId: string) => changeFilter({ turmaId }),
      onModalidadeChange: (modalidade: string) => changeFilter({ modalidade, cursoId: 'todos', turmaId: 'todos' }),
      onCursoChange: (cursoId: string) => changeFilter({ cursoId, turmaId: 'todos' }),
      onSearch: () => {
        changeFilter({});
        if (query.search === searchQuery.trim()) setReloadVersion(version => version + 1);
      },
    },
    tableProps: {
      emissions, loading, page: query.page, pagesCount: Math.ceil(totalRecords / PAGE_SIZE),
      totalRecords, systemUsers: filters.systemUsers,
      onPageChange: (page: number) => setQuery(current => ({ ...current, page })),
    },
  };
}
