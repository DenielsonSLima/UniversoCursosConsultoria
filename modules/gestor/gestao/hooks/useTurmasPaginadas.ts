import { useEffect, useState } from 'react';
import { gestaoService } from '../gestao.service';
import { StatusTurma, Turma, TurmasSortBy } from '../gestao.types';

const PAGE_SIZE = 9;

export const useTurmasPaginadas = (modalidade: Turma['modalidade'], poloId?: string) => {
  const [status, setStatus] = useState<StatusTurma>('EM_ANDAMENTO');
  const [search, setSearch] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [sortBy, setSortBy] = useState<TurmasSortBy>('NOME_ASC');
  const [applied, setApplied] = useState({ dataInicial: '', dataFinal: '' });
  const [page, setPage] = useState(1);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await gestaoService.getTurmasPage({
        modalidade, poloId, status, sortBy, page, pageSize: PAGE_SIZE, search, ...applied,
      });
      setTurmas(result.data);
      setTotal(result.total);
    } catch (rawError) {
      const nextError = rawError instanceof Error ? rawError : new Error('Não foi possível carregar as turmas.');
      setTurmas([]);
      setTotal(0);
      setError(nextError);
      throw nextError;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load().catch(() => undefined); }, [modalidade, poloId, status, sortBy, page, search, applied]);
  useEffect(() => { setPage(1); }, [modalidade, poloId]);

  const changeStatus = (next: StatusTurma) => { setStatus(next); setPage(1); };
  const changeSortBy = (next: TurmasSortBy) => { setSortBy(next); setPage(1); };
  const changeSearch = (next: string) => { setSearch(next); setPage(1); };
  const applyFilters = () => {
    setPage(1);
    setApplied({ dataInicial, dataFinal });
  };

  return {
    turmas, total, loading, error, page, pageSize: PAGE_SIZE, status, sortBy,
    search, dataInicial, dataFinal, setSearch: changeSearch, setDataInicial, setDataFinal,
    setPage, changeStatus, changeSortBy, applyFilters, reload: load,
  };
};
