import { useQuery } from '@tanstack/react-query';
import { financeiroService } from '../financeiro.service';
import { financeiroQueryKeys } from '../financeiro.queryKeys';

interface FinanceiroSharedQueriesOptions {
  poloId?: string | null;
  accounts?: boolean;
  polos?: boolean;
  partners?: boolean;
  turmas?: boolean;
}

export function useFinanceiroSharedQueries(options: FinanceiroSharedQueriesOptions = {}) {
  const {
    accounts = true,
    polos = true,
    partners = true,
    turmas = false,
    poloId,
  } = options;

  const accountsQuery = useQuery({
    queryKey: [...financeiroQueryKeys.contasBancariasSaldos, poloId || 'todos'],
    queryFn: () => financeiroService.getContasBancariasSaldos(poloId),
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: 'always',
    enabled: accounts,
  });

  const polosQuery = useQuery({
    queryKey: financeiroQueryKeys.polos,
    queryFn: () => financeiroService.getPolos(),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    enabled: polos,
  });

  const partnersQuery = useQuery({
    queryKey: financeiroQueryKeys.parceirosByPolo(poloId),
    queryFn: () => financeiroService.getParceiros(poloId || undefined),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: partners && Boolean(poloId),
  });

  const turmasQuery = useQuery({
    queryKey: ['financeiro-shared-turmas', poloId || 'sem-polo'],
    queryFn: () => financeiroService.getTurmas(poloId || undefined),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: turmas && Boolean(poloId),
  });

  return {
    accountsQuery,
    polosQuery,
    partnersQuery,
    turmasQuery,
  };
}
