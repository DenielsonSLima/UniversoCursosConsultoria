import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { gestaoQueryKeys } from '../gestao.query-keys';
import { gestaoService } from '../gestao.service';
import { StatusTurma, Turma, TurmasSortBy } from '../gestao.types';

const PAGE_SIZE = 9;

export const useTurmasPaginadas = (modalidade: Turma['modalidade'], poloId?: string) => {
  const [status, setStatus] = useState<StatusTurma>('EM_ANDAMENTO');
  const [search, setSearch] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [sortBy, setSortBy] = useState<TurmasSortBy>('NOME_ASC');
  const [applied, setApplied] = useState({ search: '', dataInicial: '', dataFinal: '' });
  const scopeKey = `${modalidade}:${poloId || 'todos'}`;
  const [pageState, setPageState] = useState({ scopeKey, page: 1 });
  const page = pageState.scopeKey === scopeKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ scopeKey, page: next });

  const filters = useMemo(() => ({
    modalidade,
    poloId,
    status,
    sortBy,
    page,
    pageSize: PAGE_SIZE,
    ...applied,
  }), [applied, modalidade, page, poloId, sortBy, status]);

  const query = useQuery({
    queryKey: gestaoQueryKeys.classPage(filters),
    queryFn: () => gestaoService.getTurmasPage(filters),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const changeStatus = (next: StatusTurma) => { setStatus(next); setPage(1); };
  const changeSortBy = (next: TurmasSortBy) => { setSortBy(next); setPage(1); };
  const changeSearch = (next: string) => { setSearch(next); };
  const applyFilters = () => {
    setPage(1);
    setApplied({ search: search.trim(), dataInicial, dataFinal });
  };

  const reload = async () => {
    const result = await query.refetch({ throwOnError: true });
    return result.data;
  };

  return {
    turmas: query.data?.data || [], total: query.data?.total || 0,
    loading: query.isPending, refreshing: query.isFetching && !query.isPending,
    error: query.error instanceof Error ? query.error : null,
    page, pageSize: PAGE_SIZE, status, sortBy,
    search, dataInicial, dataFinal, setSearch: changeSearch, setDataInicial, setDataFinal,
    setPage, changeStatus, changeSortBy, applyFilters, reload,
  };
};
